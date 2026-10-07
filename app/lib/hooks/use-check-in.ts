"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isTransactionModifyingSigner,
  isTransactionPartialSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../client-provider";
import {
  PREPARATION_VALID_MS,
  describeCheckInError,
  readCheckInFeed,
  readConfirmedCheckIn,
  simulateCheckIn,
  type CheckInEntry,
  type PreparedCheckIn,
} from "../check-in";

export type CheckInStatus =
  | "idle"
  | "simulating"
  | "ready"
  | "awaiting-signature"
  | "confirming"
  | "success"
  | "error";

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) {
      clearTimeout(timer);
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function useCheckIn() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const wallet = connected?.account.address ?? null;
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckInStatus>("idle");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [simulationSummary, setSimulationSummary] = useState<string | null>(
    null
  );
  const phase = useRef<CheckInStatus>("idle");
  const prepared = useRef<PreparedCheckIn | null>(null);
  const preparationAbort = useRef<AbortController | null>(null);
  const confirmationAbort = useRef<AbortController | null>(null);
  const feedAbort = useRef<AbortController | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const sendInFlight = useRef(false);
  const pendingSignature = useRef<string | null>(null);
  const mounted = useRef(true);

  const setPhase = useCallback((value: CheckInStatus) => {
    phase.current = value;
    if (mounted.current) setStatus(value);
  }, []);

  const mergeConfirmed = useCallback((entry: CheckInEntry) => {
    setEntries((current) =>
      [entry, ...current.filter((item) => item.signature !== entry.signature)]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20)
    );
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (
      refreshPromise.current &&
      feedAbort.current &&
      !feedAbort.current.signal.aborted
    )
      return refreshPromise.current;
    const controller = new AbortController();
    feedAbort.current = controller;
    const work = async () => {
      if (mounted.current) setIsLoading(true);
      try {
        const page = await readCheckInFeed(client.rpc, {
          abortSignal: controller.signal,
        });
        if (controller.signal.aborted || !mounted.current) return;
        setEntries(page.entries);
        setFeedError(
          page.unavailableCount > 0
            ? `节点暂未返回 ${page.unavailableCount} 笔已索引交易，当前列表可能不完整，请稍后刷新。`
            : null
        );
        // A refresh can resolve an ambiguous broadcast/confirmation error by
        // reading its existing signature. It never submits another transaction.
        const pending = pendingSignature.current;
        if (pending && phase.current === "error") {
          const entry =
            page.entries.find((item) => item.signature === pending) ??
            (await readConfirmedCheckIn(
              client.rpc,
              pending,
              controller.signal
            ));
          if (entry && mounted.current && !controller.signal.aborted) {
            mergeConfirmed(entry);
            setTransactionError(null);
            pendingSignature.current = null;
            setPhase("success");
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && mounted.current)
          setFeedError(describeCheckInError(error));
      } finally {
        if (feedAbort.current === controller) {
          feedAbort.current = null;
          if (mounted.current) setIsLoading(false);
        }
        if (refreshPromise.current === promise) refreshPromise.current = null;
      }
    };
    const promise = work();
    refreshPromise.current = promise;
    return promise;
  }, [client, mergeConfirmed, setPhase]);

  const cancel = useCallback(() => {
    if (sendInFlight.current) return;
    preparationAbort.current?.abort();
    preparationAbort.current = null;
    prepared.current = null;
    setSimulationSummary(null);
    setTransactionError(null);
    setPhase("idle");
  }, [setPhase]);

  const prepare = useCallback(
    async (nickname: string, message: string) => {
      if (sendInFlight.current || phase.current === "simulating") return;
      const active = client.wallet.getState().connected;
      const signer = active?.signer;
      prepared.current = null;
      setSimulationSummary(null);
      setTransactionError(null);
      setLastSignature(null);
      pendingSignature.current = null;
      if (!signer) {
        setTransactionError("请先连接可以签名的 Phantom 钱包。");
        setPhase("error");
        return;
      }
      if (
        !isTransactionModifyingSigner(signer) &&
        !isTransactionPartialSigner(signer)
      ) {
        setTransactionError(
          "此钱包仅支持直接签名并广播；请使用支持 signTransaction 的 Phantom，以便保留交易签名并核对发送结果。"
        );
        setPhase("error");
        return;
      }
      const controller = new AbortController();
      preparationAbort.current = controller;
      setPhase("simulating");
      try {
        const result = await simulateCheckIn(
          client.rpc,
          signer,
          nickname,
          message,
          controller.signal
        );
        if (controller.signal.aborted || !mounted.current) return;
        if (
          client.wallet.getState().connected?.account.address !==
          active.account.address
        ) {
          throw new Error("钱包账号已变化，请为当前账号重新模拟。");
        }
        prepared.current = result;
        const feeSol = (
          Number(result.feeLamports) / 1_000_000_000
        ).toLocaleString("en-US", { maximumFractionDigits: 9 });
        setSimulationSummary(
          `模拟通过 · 转账 0 SOL（仅自身转账作索引）· 预计网络费 ${feeSol} 测试 SOL${result.computeUnits !== null ? ` · ${String(result.computeUnits)} CU` : ""}。由 ${result.wallet} 支付；签名前请核对 Phantom 显示的 Devnet 与最终费用。`
        );
        setPhase("ready");
      } catch (error) {
        if (!controller.signal.aborted && mounted.current) {
          setTransactionError(describeCheckInError(error));
          setPhase("error");
        }
      } finally {
        if (preparationAbort.current === controller)
          preparationAbort.current = null;
      }
    },
    [client, setPhase]
  );

  const confirm = useCallback(async () => {
    if (sendInFlight.current || phase.current !== "ready" || !prepared.current)
      return;
    const review = prepared.current;
    const active = client.wallet.getState().connected;
    if (!active?.signer || active.account.address !== review.wallet) {
      cancel();
      setTransactionError("钱包账号已变化，请重新模拟。");
      setPhase("error");
      return;
    }
    if (Date.now() - review.preparedAt > PREPARATION_VALID_MS) {
      prepared.current = null;
      await prepare(review.nickname, review.message);
      if (phase.current === "ready")
        setTransactionError("上次模拟已过期，已重新模拟；请再次确认后签名。");
      return;
    }
    sendInFlight.current = true;
    prepared.current = null;
    setTransactionError(null);
    setPhase("awaiting-signature");
    const controller = new AbortController();
    confirmationAbort.current = controller;
    let signedSignature: string | null = null;
    let broadcastAttempted = false;
    try {
      const valid = await client.rpc
        .isBlockhashValid(
          review.transactionMessage.lifetimeConstraint.blockhash,
          { commitment: "confirmed" }
        )
        .send({ abortSignal: controller.signal });
      if (!valid.value) throw new Error("模拟中的区块哈希已过期，请重新模拟。");
      if (client.wallet.getState().connected?.account.address !== review.wallet)
        throw new Error("钱包账号已变化，请重新模拟。");
      const signed = await signTransactionMessageWithSigners(
        review.transactionMessage
      );
      if (
        signed.messageBytes.length !== review.transaction.messageBytes.length ||
        signed.messageBytes.some(
          (byte, index) => byte !== review.transaction.messageBytes[index]
        )
      ) {
        throw new Error("钱包修改了已审核的交易内容；已停止广播，请重新模拟。");
      }
      signedSignature = getSignatureFromTransaction(signed);
      if (mounted.current) setLastSignature(signedSignature);
      if (controller.signal.aborted)
        throw new Error("签名后页面已关闭，交易未由本应用广播。");
      if (client.wallet.getState().connected?.account.address !== review.wallet)
        throw new Error(
          "签名后钱包账号已变化，交易未由本应用广播，请重新模拟。"
        );
      setPhase("confirming");
      pendingSignature.current = signedSignature;
      broadcastAttempted = true;
      // Exactly one broadcast attempt. The signature is known before this
      // request, so timeouts cannot erase the user's ability to inspect it.
      await client.rpc
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 0n,
        })
        .send({ abortSignal: controller.signal });
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const entry = await readConfirmedCheckIn(
          client.rpc,
          signedSignature,
          controller.signal
        );
        if (entry) {
          if (mounted.current) {
            mergeConfirmed(entry);
            setTransactionError(null);
            setPhase("success");
          }
          pendingSignature.current = null;
          return;
        }
        await delay(2_500, controller.signal);
      }
      throw new Error(
        "节点尚未确认这笔交易。签名已保留；请点击刷新或打开 Explorer 核对，勿直接重复签到。"
      );
    } catch (error) {
      if (mounted.current) {
        const explanation = describeCheckInError(error);
        setTransactionError(
          broadcastAttempted && signedSignature
            ? `${explanation} 已保留交易签名；可刷新查询同一笔交易，应用不会自动重发。`
            : explanation
        );
        setPhase("error");
      }
    } finally {
      sendInFlight.current = false;
      if (confirmationAbort.current === controller)
        confirmationAbort.current = null;
    }
  }, [cancel, client, mergeConfirmed, prepare, setPhase]);

  useEffect(() => {
    preparationAbort.current?.abort();
    prepared.current = null;
    if (!sendInFlight.current) {
      setSimulationSummary(null);
      setTransactionError(null);
      setPhase("idle");
    }
  }, [wallet, client, setPhase]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      feedAbort.current?.abort();
      preparationAbort.current?.abort();
      confirmationAbort.current?.abort();
    };
  }, [refresh]);

  return {
    entries,
    isLoading,
    feedError,
    refresh,
    prepare,
    confirm,
    cancel,
    status,
    transactionError,
    lastSignature,
    simulationSummary,
  };
}

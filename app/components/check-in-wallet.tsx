"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { address, formatDecimalFixedPoint, lamportsToSol } from "@solana/kit";
import {
  useWallets,
  useConnect,
  useDisconnect,
  useConnectedWallet,
  useIsWalletReady,
} from "@solana/kit-plugin-wallet/react";
import { useAppClient } from "../lib/client-provider";
import { useBalance } from "../lib/hooks/use-balance";

const subscribeToHydration = () => () => {};
const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

export function requestWalletConnection() {
  window.dispatchEvent(new Event("proof-of-vibe:connect"));
}

export function CheckInWallet() {
  const client = useAppClient();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const ready = useIsWalletReady(client);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
  const {
    dispatchAsync: connect,
    error: connectError,
    isRunning: connecting,
  } = useConnect(client);
  const {
    dispatchAsync: disconnect,
    error: disconnectError,
    isRunning: disconnecting,
  } = useDisconnect(client);
  const walletAddress = connected?.account.address;
  const balance = useBalance(
    walletAddress ? address(walletAddress) : undefined
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const showWallets = () => {
      setOpen(true);
      triggerRef.current?.focus();
      triggerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    };
    window.addEventListener("proof-of-vibe:connect", showWallets);
    return () =>
      window.removeEventListener("proof-of-vibe:connect", showWallets);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const displayError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  const shortenedAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : "";

  return (
    <div className="wallet-control" ref={containerRef}>
      <button
        className={`wallet-trigger ${connected ? "wallet-connected" : ""}`}
        id="wallet-trigger"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        disabled={!hydrated || !ready}
        aria-expanded={open}
        aria-controls={open ? "wallet-options" : undefined}
        aria-label={
          walletAddress ? `钱包 ${walletAddress}` : "连接 Solana 钱包"
        }
      >
        {connected ? (
          <span className="status-dot" />
        ) : (
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 5h11a2 2 0 0 1 2 2v8H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9v2M17 9h-4v3h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span>
          {!hydrated || !ready
            ? "钱包准备中…"
            : connected
              ? shortenedAddress
              : "连接钱包"}
        </span>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div id="wallet-options" className="wallet-menu" aria-label="钱包选项">
          {!connected ? (
            <>
              <p className="eyebrow">YOUR WALLET, YOUR SIGNATURE</p>
              <h3>选择你的钱包</h3>
              <p className="wallet-help">
                我们只请求公开地址，签名始终在你的钱包中完成。
              </p>
              {wallets.length ? (
                wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    className="wallet-option"
                    disabled={connecting}
                    onClick={async () => {
                      try {
                        await connect(wallet);
                        close();
                      } catch {
                        /* The wallet hook renders the error below. */
                      }
                    }}
                  >
                    {wallet.icon && (
                      // eslint-disable-next-line @next/next/no-img-element -- Wallet Standard icons are wallet-provided data URIs.
                      <img src={wallet.icon} alt="" width="28" height="28" />
                    )}
                    <span>{wallet.name}</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))
              ) : (
                <p className="wallet-no-detection">
                  还没有检测到浏览器钱包。安装 Phantom 扩展后刷新；手机请在
                  Phantom 的内置浏览器中打开本页。
                </p>
              )}
              <a
                className="secondary-button wallet-install"
                href="https://phantom.com/download"
                target="_blank"
                rel="noopener noreferrer"
              >
                前往 Phantom 官方下载 <span aria-hidden="true">↗</span>
              </a>
              {connecting && (
                <p role="status" className="small-note">
                  请在钱包中确认连接…
                </p>
              )}
              {connectError != null && (
                <p role="alert" className="inline-error">
                  {displayError(connectError)}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="wallet-menu-heading">
                <p className="eyebrow">DEVNET WALLET</p>
                <span className="network-chip">测试网</span>
              </div>
              <p className="wallet-balance">
                {balance.lamports != null
                  ? formatDecimalFixedPoint(
                      formatter,
                      lamportsToSol(balance.lamports)
                    )
                  : balance.isLoading
                    ? "读取中…"
                    : "暂不可用"}
                <span>SOL</span>
              </p>
              {balance.error != null && (
                <p role="alert" className="inline-error">
                  余额读取失败，请稍后重试。
                </p>
              )}
              <p className="wallet-address">{walletAddress}</p>
              <div className="wallet-menu-actions">
                <button
                  className="secondary-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(walletAddress!);
                      setCopied(true);
                      setCopyError(null);
                    } catch {
                      setCopyError("复制失败，请手动复制上方地址。");
                    }
                  }}
                >
                  {copied ? "已复制" : "复制地址"}
                </button>
                <a
                  className="secondary-button"
                  href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  区块浏览器 ↗
                </a>
              </div>
              <a
                className="wallet-faucet"
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                领取 Devnet 测试 SOL <span aria-hidden="true">↗</span>
              </a>
              <button
                className="wallet-disconnect"
                disabled={disconnecting}
                onClick={async () => {
                  try {
                    await disconnect();
                    setCopied(false);
                    close();
                  } catch {
                    /* The wallet hook renders the error below. */
                  }
                }}
              >
                {disconnecting ? "断开中…" : "断开连接"}
              </button>
              {disconnectError != null && (
                <p role="alert" className="inline-error">
                  {displayError(disconnectError)}
                </p>
              )}
              {copyError && (
                <p role="alert" className="inline-error">
                  {copyError}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  estimateResourceLimitsFactory,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  type TransactionMessageBytesBase64,
  type TransactionSigner,
} from "@solana/kit";
import {
  getAddMemoInstruction,
  MEMO_PROGRAM_ADDRESS,
} from "@solana-program/memo";
import {
  getTransferSolInstruction,
  SYSTEM_PROGRAM_ADDRESS,
} from "@solana-program/system";
import type { AppClient } from "./solana-client";

export const EVENT_ID = "solana-chengdu-proof-of-vibe-v1";
// A public reference, not a wallet or recipient. Solana Pay permits reference
// keys that have no on-chain account; this key never needs a private key.
export const EVENT_REFERENCE = address(
  "8mcRruZH6tyB3S1mkRxxuAn3Je2vhm6F7rvBuowhSh4x"
);
export const MAX_MEMO_BYTES = 400;
export const PREPARATION_VALID_MS = 45_000;

export type CheckInEntry = {
  signature: string;
  wallet: string;
  nickname: string;
  message: string;
  /** Confirmed block time, in Unix seconds. */
  timestamp: number;
};

type CheckInMemo = {
  app: "chengdu-check-in";
  event: typeof EVENT_ID;
  v: 1;
  nickname: string;
  message: string;
};

type CheckInRpc = Pick<
  AppClient["rpc"],
  | "getLatestBlockhash"
  | "simulateTransaction"
  | "getFeeForMessage"
  | "getBalance"
  | "getSignaturesForAddress"
  | "getTransaction"
>;
const encoder = new TextEncoder();

function makeCheckInMemo(nickname: string, message: string): CheckInMemo {
  return {
    app: "chengdu-check-in",
    event: EVENT_ID,
    v: 1,
    nickname: nickname.trim(),
    message: message.trim(),
  };
}

export function measureCheckInMemoBytes(
  nickname: string,
  message: string
): number {
  return encoder.encode(JSON.stringify(makeCheckInMemo(nickname, message)))
    .length;
}

export function encodeCheckInMemo(nickname: string, message: string): string {
  const memo = makeCheckInMemo(nickname, message);
  const name = memo.nickname;
  const note = memo.message;
  if (!name || Array.from(name).length > 24) {
    throw new Error("昵称需要 1–24 个字符。");
  }
  if (!note || Array.from(note).length > 100) {
    throw new Error("留言需要 1–100 个字符。");
  }
  if (
    /[\u0000-\u001f\u007f]/.test(name) ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(note)
  ) {
    throw new Error("昵称或留言包含不支持的控制字符。");
  }
  const serialized = JSON.stringify(memo);
  const bytes = encoder.encode(serialized).length;
  if (bytes > MAX_MEMO_BYTES) {
    throw new Error(
      `链上内容共 ${bytes} UTF-8 字节，上限 ${MAX_MEMO_BYTES}；请缩短昵称或留言。`
    );
  }
  return serialized;
}

export function buildCheckInInstructions(
  signer: TransactionSigner,
  nickname: string,
  message: string
) {
  const memo = getAddMemoInstruction({
    memo: encodeCheckInMemo(nickname, message),
    signers: [signer],
  });
  const selfTransfer = getTransferSolInstruction({
    source: signer,
    destination: signer.address,
    amount: 0n,
  });
  // Reference keys belong on the System transfer, never on the Memo: Memo
  // requires every supplied account to sign. The System program ignores
  // additional read-only accounts, making this an indexable zero SOL transfer.
  const indexedTransfer = {
    ...selfTransfer,
    accounts: [
      ...selfTransfer.accounts,
      { address: EVENT_REFERENCE, role: AccountRole.READONLY },
    ],
  };
  return [memo, indexedTransfer] as const;
}

/** Builds and simulates an unsigned v0 transaction. No wallet method is called. */
export async function simulateCheckIn(
  rpc: CheckInRpc,
  signer: TransactionSigner,
  nickname: string,
  message: string,
  abortSignal?: AbortSignal
) {
  const instructions = buildCheckInInstructions(signer, nickname, message);
  const { value: lifetime } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send({ abortSignal });
  const messageWithExplicitPrice = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    // Phantom automatically adds priority fees to unsigned messages without
    // compute-budget instructions. Make the Devnet price explicit before any
    // simulation so the wallet can sign the exact message the user reviewed.
    (m) => setTransactionMessageComputeUnitPrice(0n, m)
  );
  let estimatedComputeUnits: number;
  try {
    const estimate = await estimateResourceLimitsFactory({ rpc })(
      messageWithExplicitPrice,
      { abortSignal, commitment: "confirmed" }
    );
    estimatedComputeUnits = estimate.computeUnitLimit;
  } catch (error) {
    // The official estimator rejects missing unitsConsumed; never silently
    // substitute a guessed, potentially insufficient compute limit.
    throw new Error(
      "无法估计本次交易所需的计算预算，尚未请求签名；请检查测试币余额或稍后重新模拟。",
      { cause: error }
    );
  }
  if (
    !Number.isSafeInteger(estimatedComputeUnits) ||
    estimatedComputeUnits <= 0 ||
    estimatedComputeUnits > 1_400_000
  ) {
    throw new Error("节点返回的计算预算无效，尚未请求签名；请重新模拟。");
  }
  const computeUnitLimit = Math.min(
    1_400_000,
    Math.ceil(estimatedComputeUnits * 1.1)
  );
  const transactionMessage = setTransactionMessageComputeUnitLimit(
    computeUnitLimit,
    messageWithExplicitPrice
  );
  // Simulate the final, fee-budgeted message as well as the estimator's probe.
  // This is the exact message later checked against the wallet's signed result.
  const transaction = compileTransaction(transactionMessage);
  const encodedTransaction = getBase64EncodedWireTransaction(transaction);
  const simulation = await rpc
    .simulateTransaction(encodedTransaction, {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
    })
    .send({ abortSignal });
  if (simulation.value.err !== null) {
    throw new Error(
      `模拟失败，尚未请求签名：${JSON.stringify(simulation.value.err)}`
    );
  }
  const messageBytesBase64 = getBase64Decoder().decode(
    transaction.messageBytes
  ) as TransactionMessageBytesBase64;
  const fee = await rpc
    .getFeeForMessage(messageBytesBase64, {
      commitment: "confirmed",
    })
    .send({ abortSignal });
  if (fee.value === null) {
    throw new Error("节点尚未提供本次交易费用，请重新模拟。");
  }
  const balance = await rpc
    .getBalance(signer.address, { commitment: "confirmed" })
    .send({ abortSignal });
  if (balance.value < fee.value) {
    throw new Error("Devnet SOL 不足以支付网络费，请先领取测试币。");
  }
  return {
    transactionMessage,
    transaction,
    nickname: nickname.trim(),
    message: message.trim(),
    wallet: String(signer.address),
    preparedAt: Date.now(),
    feeLamports: fee.value,
    computeUnits: simulation.value.unitsConsumed ?? null,
  };
}

export type PreparedCheckIn = Awaited<ReturnType<typeof simulateCheckIn>>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validMemo(value: unknown): value is CheckInMemo {
  if (
    !record(value) ||
    Object.keys(value).length !== 5 ||
    value.app !== "chengdu-check-in" ||
    value.event !== EVENT_ID ||
    value.v !== 1
  )
    return false;
  if (typeof value.nickname !== "string" || typeof value.message !== "string")
    return false;
  try {
    return (
      encodeCheckInMemo(value.nickname, value.message) === JSON.stringify(value)
    );
  } catch {
    return false;
  }
}

/** Treat all chain data as untrusted; unrelated, malformed and failed records are ignored. */
export function parseCheckInTransaction(
  value: unknown,
  transactionSignature: string
): CheckInEntry | null {
  if (
    !record(value) ||
    !record(value.meta) ||
    value.meta.err !== null ||
    !record(value.transaction)
  )
    return null;
  if (
    typeof value.blockTime !== "number" &&
    typeof value.blockTime !== "bigint"
  )
    return null;
  const blockTime = Number(value.blockTime);
  if (
    !Number.isSafeInteger(blockTime) ||
    blockTime < 0 ||
    !record(value.transaction.message)
  )
    return null;
  const message = value.transaction.message;
  if (
    !Array.isArray(message.accountKeys) ||
    !Array.isArray(message.instructions)
  )
    return null;
  const payer = message.accountKeys[0];
  if (
    !record(payer) ||
    payer.signer !== true ||
    typeof payer.pubkey !== "string"
  )
    return null;
  const reference = message.accountKeys.find(
    (account) => record(account) && account.pubkey === EVENT_REFERENCE
  );
  if (
    !record(reference) ||
    reference.signer !== false ||
    reference.writable !== false
  )
    return null;
  const selfTransfer = message.instructions.some((instruction) => {
    if (
      !record(instruction) ||
      instruction.programId !== SYSTEM_PROGRAM_ADDRESS ||
      !record(instruction.parsed)
    )
      return false;
    const parsed = instruction.parsed;
    if (parsed.type !== "transfer" || !record(parsed.info)) return false;
    return (
      parsed.info.source === payer.pubkey &&
      parsed.info.destination === payer.pubkey &&
      (parsed.info.lamports === 0 || parsed.info.lamports === 0n)
    );
  });
  if (!selfTransfer) return null;
  for (const instruction of message.instructions) {
    if (
      !record(instruction) ||
      instruction.programId !== MEMO_PROGRAM_ADDRESS ||
      typeof instruction.parsed !== "string"
    )
      continue;
    if (encoder.encode(instruction.parsed).length > MAX_MEMO_BYTES) continue;
    try {
      const memo: unknown = JSON.parse(instruction.parsed);
      if (!validMemo(memo)) continue;
      return {
        signature: transactionSignature,
        wallet: payer.pubkey,
        nickname: memo.nickname,
        message: memo.message,
        timestamp: blockTime,
      };
    } catch {
      // A bad memo cannot prevent other confirmed transactions from rendering.
    }
  }
  return null;
}

export async function readConfirmedCheckIn(
  rpc: CheckInRpc,
  transactionSignature: string,
  abortSignal?: AbortSignal
) {
  const transaction = await rpc
    .getTransaction(signature(transactionSignature), {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    .send({ abortSignal });
  if (transaction === null) return null;
  if (transaction.meta?.err !== null)
    throw new Error(
      `链上交易执行失败：${JSON.stringify(transaction.meta?.err)}`
    );
  const entry = parseCheckInTransaction(transaction, transactionSignature);
  if (!entry)
    throw new Error(
      "已读取链上交易，但它不符合本活动的签到格式；请在 Explorer 核对。"
    );
  return entry;
}

/** One bounded page, with no more than three getTransaction calls in flight. */
export async function readCheckInFeed(
  rpc: CheckInRpc,
  options: { limit?: number; before?: string; abortSignal?: AbortSignal } = {}
) {
  const limit = Math.min(20, Math.max(1, Math.trunc(options.limit ?? 20)));
  const signatures = await rpc
    .getSignaturesForAddress(EVENT_REFERENCE, {
      commitment: "confirmed",
      limit,
      ...(options.before ? { before: signature(options.before) } : {}),
    })
    .send({ abortSignal: options.abortSignal });
  const entries: CheckInEntry[] = [];
  let next = 0;
  let unavailableCount = 0;
  let failed = false;
  let transportError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(3, signatures.length) }, async () => {
      while (next < signatures.length && !failed) {
        const item = signatures[next++];
        if (item.err !== null) continue;
        // Transport/RPC errors propagate, so a failed node never masquerades as
        // an empty wall. Invalid data in an individual transaction is skipped.
        let transaction;
        try {
          transaction = await rpc
            .getTransaction(item.signature, {
              encoding: "jsonParsed",
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            })
            .send({ abortSignal: options.abortSignal });
        } catch (error) {
          failed = true;
          transportError = error;
          return;
        }
        if (transaction === null) {
          unavailableCount++;
          continue;
        }
        const entry = parseCheckInTransaction(
          transaction,
          String(item.signature)
        );
        if (entry) entries.push(entry);
      }
    })
  );
  if (failed) throw transportError;
  entries.sort(
    (a, b) =>
      b.timestamp - a.timestamp ||
      signatures.findIndex((item) => item.signature === a.signature) -
        signatures.findIndex((item) => item.signature === b.signature)
  );
  return {
    entries,
    nextCursor:
      signatures.length === limit
        ? String(signatures[signatures.length - 1].signature)
        : null,
    unavailableCount,
  };
}

export function describeCheckInError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    messages.push(current.message);
    current = current.cause;
  }
  const raw = messages.join(" · ") || String(error);
  if (/429|too many requests|rate.limit/i.test(raw))
    return "RPC 请求受限（429）。请稍后刷新，或配置独立的 Devnet RPC；现有记录仍保留。";
  if (/user rejected|user declined|rejected by user/i.test(raw))
    return "你取消了钱包签名，交易未发送。";
  if (/blockhash|expired|BlockHeightExceeded/i.test(raw))
    return "交易区块哈希已过期，请先核对上次签名，再重新模拟。";
  return raw.length > 320 ? `${raw.slice(0, 320)}…` : raw;
}

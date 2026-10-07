import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  getAddMemoInstruction,
  MEMO_PROGRAM_ADDRESS,
} from "@solana-program/memo";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { ClientProvider } from "@solana/react";
import { Surfnet } from "@solana/surfpool";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { StrictMode, type ReactNode } from "react";
import {
  EVENT_ID,
  EVENT_REFERENCE,
  MAX_MEMO_BYTES,
  buildCheckInInstructions,
  encodeCheckInMemo,
  parseCheckInTransaction,
  readCheckInFeed,
  readConfirmedCheckIn,
  simulateCheckIn,
} from "../app/lib/check-in";
import { useCheckIn } from "../app/lib/hooks/use-check-in";
import { createAppClient } from "../app/lib/solana-client";
import {
  mockWallet,
  mockWalletAddress,
  registerMockWallet,
  resetMockWallet,
} from "./mock-wallet";

let surfnet: Surfnet;
let rpc: ReturnType<typeof createSolanaRpc>;

beforeAll(() => {
  surfnet = Surfnet.start();
  rpc = createSolanaRpc(surfnet.rpcUrl);
  registerMockWallet();
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  resetMockWallet();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => surfnet?.stop());

async function sendInstructions(
  signer: TransactionSigner,
  instructions: readonly Instruction[]
) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );
  const signed = await signTransactionMessageWithSigners(message);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      skipPreflight: false,
    })
    .send();
  return getSignatureFromTransaction(signed);
}

test("a real zero SOL self-transfer and memo are indexed by the unfunded event reference", async () => {
  const signer = await generateKeyPairSigner();
  surfnet.fundSol(signer.address, 2_000_000_000);
  const { value: before } = await rpc.getBalance(signer.address).send();
  const { value: referenceBefore } = await rpc
    .getBalance(EVENT_REFERENCE)
    .send();
  expect(referenceBefore).toBe(0n);
  const prepared = await simulateCheckIn(
    rpc,
    signer,
    "成都同学",
    "今天一起做 Solana demo。"
  );
  // Simulation uses zero signatures and cannot move funds or create a record.
  expect(
    Object.values(prepared.transaction.signatures).every(
      (signature) => signature === null
    )
  ).toBe(true);
  expect((await rpc.getBalance(signer.address).send()).value).toBe(before);
  const signed = await signTransactionMessageWithSigners(
    prepared.transactionMessage
  );
  const txSignature = getSignatureFromTransaction(signed);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
    })
    .send();
  let entry: Awaited<ReturnType<typeof readConfirmedCheckIn>> = null;
  await waitFor(async () => {
    entry = await readConfirmedCheckIn(rpc, txSignature);
    expect(entry).not.toBeNull();
  });
  expect(entry).toMatchObject({
    wallet: signer.address,
    nickname: "成都同学",
    message: "今天一起做 Solana demo。",
    signature: txSignature,
  });
  const signatures = await rpc.getSignaturesForAddress(EVENT_REFERENCE).send();
  expect(signatures.some((item) => item.signature === txSignature)).toBe(true);
  const feed = await readCheckInFeed(rpc);
  expect(feed.entries.some((item) => item.signature === txSignature)).toBe(
    true
  );
  const transaction = await rpc
    .getTransaction(txSignature, {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    .send();
  const after = (await rpc.getBalance(signer.address).send()).value;
  // No recipient receives SOL; the sole balance reduction is the real network fee.
  expect(before - after).toBe(transaction?.meta?.fee);
  expect((await rpc.getBalance(EVENT_REFERENCE).send()).value).toBe(
    referenceBefore
  );
});

test("an actual on-chain transaction for another event is excluded from this wall", async () => {
  const signer = await generateKeyPairSigner();
  surfnet.fundSol(signer.address, 1_000_000_000);
  const instructions = buildCheckInInstructions(
    signer,
    "别的活动",
    "不要进入成都墙"
  );
  const data = JSON.parse(encodeCheckInMemo("别的活动", "不要进入成都墙"));
  data.event = "another-event";
  const otherMemo = getAddMemoInstruction({
    memo: JSON.stringify(data),
    signers: [signer],
  });
  const txSignature = await sendInstructions(signer, [
    otherMemo,
    instructions[1],
  ]);
  const transaction = await rpc
    .getTransaction(txSignature, {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    })
    .send();
  expect(transaction?.meta?.err).toBeNull();
  expect(parseCheckInTransaction(transaction, txSignature)).toBeNull();
  expect(
    (await readCheckInFeed(rpc)).entries.some(
      (entry) => entry.signature === txSignature
    )
  ).toBe(false);
});

test("simulation rejects a wallet unable to pay the fee without signing it", async () => {
  const signer = await generateKeyPairSigner();
  await expect(
    simulateCheckIn(rpc, signer, "未领币", "模拟必须失败")
  ).rejects.toThrow();
  expect((await rpc.getBalance(signer.address).send()).value).toBe(0n);
});

test("the hook requires explicit confirmation after simulation, then reads confirmed chain data", async () => {
  surfnet.fundSol(mockWalletAddress, 2_000_000_000);
  const client = createAppClient("localnet", {
    rpcUrl: surfnet.rpcUrl,
    rpcSubscriptionsUrl: surfnet.wsUrl,
  });
  await waitFor(() =>
    expect(
      client.wallet
        .getState()
        .wallets.some((wallet) => wallet.name === "Mock Wallet")
    ).toBe(true)
  );
  const discovered = client.wallet
    .getState()
    .wallets.find((wallet) => wallet.name === "Mock Wallet")!;
  await client.wallet.connect(discovered);
  const sign = vi.spyOn(
    mockWallet.features["solana:signTransaction"],
    "signTransaction"
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <ClientProvider client={client}>{children}</ClientProvider>
    </StrictMode>
  );
  const { result } = renderHook(() => useCheckIn(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.feedError).toBeNull();
  await act(async () => {
    await result.current.confirm();
  });
  expect(sign).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.prepare("钱包同学", "先模拟，再亲自签名");
  });
  expect(result.current.status).toBe("ready");
  expect(result.current.simulationSummary).toContain("转账 0 SOL");
  expect(sign).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.confirm();
  });
  expect(sign).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("success");
  expect(result.current.lastSignature).not.toBeNull();
  expect(
    result.current.entries.some(
      (entry) => entry.signature === result.current.lastSignature
    )
  ).toBe(true);
  await act(async () => {
    await result.current.prepare("下一笔", "钱包拒绝签名");
  });
  expect(result.current.lastSignature).toBeNull();
  sign.mockRejectedValueOnce(new Error("User rejected signing"));
  await act(async () => {
    await result.current.confirm();
  });
  expect(result.current.status).toBe("error");
  expect(result.current.transactionError).toContain("取消了钱包签名");
  expect(result.current.lastSignature).toBeNull();
});

function fixture(overrides: Record<string, unknown> = {}) {
  const wallet = mockWalletAddress;
  return {
    blockTime: 1_790_000_000,
    meta: { err: null },
    transaction: {
      message: {
        accountKeys: [
          { pubkey: wallet, signer: true, writable: true },
          { pubkey: EVENT_REFERENCE, signer: false, writable: false },
        ],
        instructions: [
          {
            programId: MEMO_PROGRAM_ADDRESS,
            parsed: encodeCheckInMemo("同学", "真实签名"),
          },
          {
            programId: SYSTEM_PROGRAM_ADDRESS,
            parsed: {
              type: "transfer",
              info: { source: wallet, destination: wallet, lamports: 0 },
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

test("failed transactions and malformed data cannot become attendance records", () => {
  expect(parseCheckInTransaction(fixture(), "signature")).toMatchObject({
    wallet: mockWalletAddress,
    timestamp: 1_790_000_000,
  });
  expect(
    parseCheckInTransaction(
      fixture({ meta: { err: { InstructionError: [0, "Custom"] } } }),
      "signature"
    )
  ).toBeNull();
  expect(
    parseCheckInTransaction(fixture({ blockTime: null }), "signature")
  ).toBeNull();
  expect(parseCheckInTransaction({ transaction: {} }, "signature")).toBeNull();
  const wrongVersion = fixture();
  wrongVersion.transaction.message.instructions[0].parsed = JSON.stringify({
    app: "chengdu-check-in",
    event: EVENT_ID,
    v: 2,
    nickname: "同学",
    message: "不支持",
  });
  expect(parseCheckInTransaction(wrongVersion, "signature")).toBeNull();
  const missingReference = fixture();
  missingReference.transaction.message.accountKeys.pop();
  expect(parseCheckInTransaction(missingReference, "signature")).toBeNull();
});

test("the payload limit counts actual UTF-8 bytes, including Chinese and emoji", () => {
  const ascii = encodeCheckInMemo("同学", "a".repeat(100));
  expect(new TextEncoder().encode(ascii).length).toBeLessThanOrEqual(
    MAX_MEMO_BYTES
  );
  expect(() => encodeCheckInMemo("同学", "🧑‍💻".repeat(30))).toThrow(
    /UTF-8|字符/
  );
  expect(() => encodeCheckInMemo("成".repeat(24), "都".repeat(100))).toThrow(
    /UTF-8/
  );
  expect(() => encodeCheckInMemo("", "留言")).toThrow(/昵称/);
  expect(() => encodeCheckInMemo("同学", "")).toThrow(/留言/);
});

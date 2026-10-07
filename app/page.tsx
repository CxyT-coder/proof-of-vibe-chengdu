"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import {
  CheckInWallet,
  requestWalletConnection,
} from "./components/check-in-wallet";
import { useAppClient } from "./lib/client-provider";
import { useCheckIn } from "./lib/hooks/use-check-in";
import {
  encodeCheckInMemo,
  measureCheckInMemoBytes,
  EVENT_REFERENCE,
  MAX_MEMO_BYTES,
  type CheckInEntry,
} from "./lib/check-in";

function Arrow({
  diagonal = false,
  className = "",
}: {
  diagonal?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m4 10 4 4 8-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VibeMark() {
  return (
    <svg
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path
        d="m10 21 7 7 14-16M26 27l4 4"
        stroke="#D5F66A"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Star({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M40 0 48 25 70 10 55 32 80 40 55 48 70 70 48 55 40 80 32 55 10 70 25 48 0 40 25 32 10 10 32 25Z"
        fill="currentColor"
      />
    </svg>
  );
}

const shortAddress = (wallet: string) =>
  `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
const transactionUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

function EntryCard({ entry, mine }: { entry: CheckInEntry; mine: boolean }) {
  return (
    <article className={`entry-card ${mine ? "entry-mine" : ""}`}>
      <div className="entry-top">
        <span className="entry-avatar" aria-hidden="true">
          {Array.from(entry.nickname)[0] || "B"}
        </span>
        <div className="entry-person">
          <h3>{entry.nickname}</h3>
          <a
            href={`https://explorer.solana.com/address/${entry.wallet}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`查看钱包 ${entry.wallet}`}
          >
            {shortAddress(entry.wallet)}
          </a>
        </div>
        {mine && <span className="mine-chip">我</span>}
        <span className="verified-icon" title="交易已在 Devnet 确认">
          <Check />
          <span className="sr-only">交易已确认</span>
        </span>
      </div>
      <p className="entry-message">{entry.message || "（未填写留言）"}</p>
      <div className="entry-bottom">
        <time dateTime={new Date(entry.timestamp * 1000).toISOString()}>
          {timeFormatter.format(new Date(entry.timestamp * 1000))}{" "}
          <span>北京时间</span>
        </time>
        <a
          href={transactionUrl(entry.signature)}
          target="_blank"
          rel="noopener noreferrer"
        >
          链上核验 <Arrow diagonal />
        </a>
      </div>
    </article>
  );
}

export default function Home() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const walletAddress = connected?.account.address;
  const {
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
  } = useCheckIn();
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const reviewRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy =
    status === "simulating" ||
    status === "awaiting-signature" ||
    status === "confirming";
  const reviewOpen =
    status === "ready" ||
    status === "awaiting-signature" ||
    status === "confirming";

  const memoInfo = useMemo(() => {
    const byteCount = measureCheckInMemoBytes(nickname, message);
    try {
      const memo = encodeCheckInMemo(nickname.trim(), message.trim());
      return {
        memo,
        byteCount,
        error: null,
      };
    } catch (error) {
      return {
        memo: "",
        byteCount,
        error: error instanceof Error ? error.message : "请检查昵称和留言。",
      };
    }
  }, [nickname, message]);
  const valid =
    nickname.trim().length > 0 &&
    message.trim().length > 0 &&
    memoInfo.byteCount <= MAX_MEMO_BYTES &&
    !memoInfo.error;
  const visibleEntries = onlyMine
    ? entries.filter((entry) => entry.wallet === walletAddress)
    : entries;

  useEffect(() => {
    const dialog = reviewRef.current;
    if (!dialog) return;
    if (reviewOpen && !dialog.open) dialog.showModal();
    if (!reviewOpen && dialog.open) dialog.close();
  }, [reviewOpen]);

  const changeInput = (kind: "nickname" | "message", value: string) => {
    cancel();
    if (kind === "nickname") setNickname(value);
    else setMessage(value);
  };

  const statusMessage =
    status === "simulating"
      ? "正在模拟交易并估算网络费…"
      : status === "awaiting-signature"
        ? "请在钱包弹窗中确认签名。"
        : status === "confirming"
          ? "交易已发送，等待 Solana Devnet 确认…"
          : "";

  return (
    <>
      <a className="skip-link" href="#check-in">
        跳到签到表单
      </a>
      <div className="site-shell">
        <header className="site-header">
          <a className="brand" href="#" aria-label="Proof of Vibe 首页">
            <VibeMark />
            <span>
              proof of <strong>vibe</strong>
              <span className="brand-caption">成都链上签到</span>
            </span>
          </a>
          <nav className="header-nav" aria-label="页面导航">
            <a href="#check-in">留个印记</a>
            <a href="#wall">签到墙</a>
            <a href="#how-it-works">怎么参与</a>
          </nav>
          <div className="header-actions">
            <span className="network-chip">
              <span className="status-dot" />
              DEVNET
            </span>
            <CheckInWallet />
          </div>
        </header>

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <div className="hero-eyebrow">
                <span className="tiny-star" aria-hidden="true">
                  ✳
                </span>
                <span>成都 · SOLANA 开发者活动</span>
                <span className="demo-label">DEVNET DEMO</span>
              </div>
              <h1 id="hero-title">
                来过成都，
                <br />
                <span className="headline-highlight">
                  留个链上印记
                  <svg
                    viewBox="0 0 480 20"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 12Q180-5 476 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="11"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="headline-stop">。</span>
              </h1>
              <p className="hero-description">
                相遇很短，记忆可以很长。
                <br />
                连接钱包，把你的名字和一句话，留在 Solana 上。
              </p>
              <div className="hero-cta">
                <a href="#check-in" className="primary-button">
                  留下我的印记 <Arrow />
                </a>
                <a href="#wall" className="text-link">
                  先看看大家 <Arrow diagonal />
                </a>
              </div>
              <div className="hero-facts">
                <span>
                  <span className="fact-dot" />
                  公开可验证
                </span>
                <span>0 SOL 转账</span>
                <span>仅使用测试币</span>
              </div>
            </div>

            <div className="hero-art">
              <div className="orbit-label" aria-hidden="true">
                <Star />
                <span>
                  GOOD VIBES
                  <br />
                  ON CHAIN.
                </span>
              </div>
              <div className="ticket-wrapper">
                <div className="ticket-back" aria-hidden="true" />
                <article
                  className="vibe-ticket"
                  aria-label="签到凭证预览，尚未上链"
                >
                  <div className="ticket-main">
                    <div className="ticket-heading">
                      <span>PROOF OF VIBE</span>
                      <Arrow diagonal />
                    </div>
                    <p className="ticket-kicker">YOUR CHENGDU MEMORY</p>
                    <div className="ticket-city">
                      成 都<span>CHENGDU, ON CHAIN.</span>
                    </div>
                    <div className="ticket-name">
                      <span>THIS VIBE BELONGS TO</span>
                      <strong>{nickname.trim() || "下一位 Builder"}</strong>
                    </div>
                    <p className="ticket-message">
                      {message.trim() || "「 在这里，写下你想留下的一句话。 」"}
                    </p>
                    <div className="ticket-stamp" aria-hidden="true">
                      HELLO
                      <br />
                      <strong>CHENGDU</strong>
                      <span>SOLANA DEVNET</span>
                    </div>
                  </div>
                  <div className="ticket-stub">
                    <div>
                      <span className="ticket-preview-label">
                        凭证预览 · 尚未上链
                      </span>
                      <p>
                        ONE MOMENT.
                        <br />
                        ONE ON-CHAIN MEMORY.
                      </p>
                    </div>
                    <div className="ticket-barcode" aria-hidden="true" />
                  </div>
                </article>
              </div>
              <p className="art-caption">
                <span aria-hidden="true">↳</span> 你的名字，值得一个链上坐标。
              </p>
            </div>
          </section>

          <div className="section-divider" aria-hidden="true">
            <span>MAKE A MEMORY</span>
            <div />
            <Star />
            <div />
            <span>KEEP THE VIBE</span>
          </div>

          <section
            id="check-in"
            className="check-in-section"
            aria-labelledby="check-in-title"
          >
            <div className="check-in-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">01 / LEAVE YOUR MARK</p>
                  <h2 id="check-in-title">
                    写下你的成都时刻<span>↘</span>
                  </h2>
                </div>
                <span className="form-tag">链上签到</span>
              </div>
              <p className="section-description">
                一句期待、一个灵感，或者简单说声「我来过」。
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!walletAddress) {
                    requestWalletConnection();
                    return;
                  }
                  if (valid && !busy)
                    void prepare(nickname.trim(), message.trim()).catch(
                      () => undefined
                    );
                }}
              >
                <div className="field">
                  <div className="field-heading">
                    <label htmlFor="nickname">
                      怎么称呼你？ <span>*</span>
                    </label>
                    <span>{nickname.length} / 24</span>
                  </div>
                  <input
                    ref={inputRef}
                    id="nickname"
                    name="nickname"
                    placeholder="你的昵称，不必是真名"
                    value={nickname}
                    maxLength={24}
                    required
                    autoComplete="nickname"
                    disabled={busy}
                    onChange={(event) =>
                      changeInput("nickname", event.target.value)
                    }
                  />
                </div>
                <div className="field">
                  <div className="field-heading">
                    <label htmlFor="message">
                      给今天留一句话 <span>*</span>
                    </label>
                    <span>{message.length} / 100</span>
                  </div>
                  <textarea
                    id="message"
                    name="message"
                    placeholder="比如：在成都，写下我的第一笔 Solana 交易。"
                    value={message}
                    maxLength={100}
                    required
                    rows={3}
                    disabled={busy}
                    onChange={(event) =>
                      changeInput("message", event.target.value)
                    }
                    aria-describedby="memo-size public-note"
                  />
                </div>
                <div
                  id="memo-size"
                  className={`memo-size ${memoInfo.byteCount > MAX_MEMO_BYTES ? "memo-size-error" : ""}`}
                >
                  <span>Memo 使用 UTF-8 编码，中文会占用更多字节。</span>
                  <span>
                    {memoInfo.byteCount} / {MAX_MEMO_BYTES} bytes
                  </span>
                </div>
                {memoInfo.byteCount > MAX_MEMO_BYTES && (
                  <p role="alert" className="inline-error">
                    内容超过链上 Memo 限制，请缩短昵称或留言。
                  </p>
                )}
                {memoInfo.error &&
                  nickname.trim() &&
                  message.trim() &&
                  memoInfo.byteCount <= MAX_MEMO_BYTES && (
                    <p className="inline-error">{memoInfo.error}</p>
                  )}
                <p id="public-note" className="public-note">
                  <svg
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="4"
                      y="8"
                      width="12"
                      height="9"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M6 8V6a4 4 0 0 1 8 0v2m-4 4v2"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                  昵称和留言会公开上链，请勿填写隐私或敏感信息。
                </p>
                <button
                  className="primary-button submit-button"
                  type={walletAddress ? "submit" : "button"}
                  onClick={walletAddress ? undefined : requestWalletConnection}
                  disabled={busy || (Boolean(walletAddress) && !valid)}
                >
                  {busy ? (
                    <>
                      <span className="spinner" />
                      {status === "simulating"
                        ? "正在模拟交易"
                        : status === "awaiting-signature"
                          ? "等待钱包签名"
                          : "等待链上确认"}
                    </>
                  ) : (
                    <>
                      {walletAddress
                        ? "预览并模拟我的签到"
                        : "连接钱包，开始签到"}
                      <Arrow />
                    </>
                  )}
                </button>
                <p className="form-fee-note">
                  零 SOL 转账 · 仅需 Devnet 网络费 · 确认后再打开钱包
                </p>
                {statusMessage && (
                  <p role="status" className="transaction-status">
                    {statusMessage}
                  </p>
                )}
                {transactionError && (
                  <div role="alert" className="notice notice-error">
                    <strong>签到暂未完成</strong>
                    <p>{transactionError}</p>
                    {lastSignature ? (
                      <>
                        <p>
                          已保留签名。请先核对这笔交易或刷新记录，再决定是否重新签到。
                        </p>
                        <a
                          className="text-link"
                          href={transactionUrl(lastSignature)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          核对这笔已签名交易 <Arrow diagonal />
                        </a>
                        <p className="mono">{lastSignature}</p>
                      </>
                    ) : (
                      <span>
                        可以检查 Devnet 测试币余额后重试，或稍后再次提交。
                      </span>
                    )}
                  </div>
                )}
                {status === "success" && lastSignature && (
                  <div role="status" className="notice notice-success">
                    <div>
                      <Check />
                      <strong>你的成都印记，已上链。</strong>
                    </div>
                    <p>交易已确认。你可以在区块浏览器中独立查看凭证。</p>
                    <a
                      href={transactionUrl(lastSignature)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看我的签到交易 <Arrow diagonal />
                    </a>
                  </div>
                )}
              </form>
            </div>

            <aside
              id="how-it-works"
              className="how-card"
              aria-labelledby="how-title"
            >
              <p className="eyebrow">SMALL STEPS, REAL PROOF.</p>
              <h2 id="how-title">三步，把记忆留住。</h2>
              <ol className="steps">
                <li className={walletAddress ? "step-complete" : ""}>
                  <span className="step-number">
                    {walletAddress ? <Check /> : "01"}
                  </span>
                  <div>
                    <h3>连接你的钱包</h3>
                    <p>
                      使用 Phantom 等 Solana 钱包。手机在 Phantom
                      内置浏览器中打开。
                    </p>
                    <a
                      href="https://phantom.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      安装 Phantom <Arrow diagonal />
                    </a>
                  </div>
                </li>
                <li>
                  <span className="step-number">02</span>
                  <div>
                    <h3>准备一点测试 SOL</h3>
                    <p>在钱包中切换到 Devnet，领取免费测试币用于网络费。</p>
                    <a
                      href="https://faucet.solana.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开官方领币页面 <Arrow diagonal />
                    </a>
                  </div>
                </li>
                <li className={status === "success" ? "step-complete" : ""}>
                  <span className="step-number">
                    {status === "success" ? <Check /> : "03"}
                  </span>
                  <div>
                    <h3>预览、签名、留下印记</h3>
                    <p>
                      先模拟交易，再由你确认。签到内容将作为 Memo 写入 Solana。
                    </p>
                  </div>
                </li>
              </ol>
              <div className="devnet-note">
                <Star />
                <div>
                  <strong>这里是测试网练习场。</strong>
                  <p>
                    测试 SOL
                    无真实货币价值，无需购买。不要分享钱包助记词或私钥。
                  </p>
                </div>
              </div>
            </aside>
          </section>

          <section
            id="wall"
            className="wall-section"
            aria-labelledby="wall-title"
          >
            <div className="wall-heading">
              <div>
                <p className="eyebrow">02 / PEOPLE MAKE THE VIBE</p>
                <h2 id="wall-title">
                  相遇，正在链上发生
                  <span
                    className="record-count"
                    aria-label={`${entries.length} 条已读取记录`}
                  >
                    {isLoading && !entries.length
                      ? "…"
                      : feedError && !entries.length
                        ? "—"
                        : entries.length}
                  </span>
                </h2>
                <p className="section-description">
                  从 Solana Devnet 最近的活动交易中读取签到，每一条都可以核验。
                </p>
              </div>
              <button
                className="secondary-button refresh-button"
                disabled={isLoading}
                onClick={() => void refresh().catch(() => undefined)}
              >
                <svg
                  className={isLoading ? "spin" : ""}
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M16 6a7 7 0 1 0 1 7M16 2v4h-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {isLoading ? "读取中" : "刷新记录"}
              </button>
            </div>
            <div className="wall-toolbar">
              <div className="feed-tabs" role="group" aria-label="筛选签到记录">
                <button
                  aria-pressed={!onlyMine}
                  className={!onlyMine ? "tab-active" : ""}
                  onClick={() => setOnlyMine(false)}
                >
                  大家的印记
                </button>
                <button
                  aria-pressed={onlyMine}
                  className={onlyMine ? "tab-active" : ""}
                  onClick={() => setOnlyMine(true)}
                >
                  我的印记{" "}
                  {walletAddress && (
                    <span>
                      {
                        entries.filter(
                          (entry) => entry.wallet === walletAddress
                        ).length
                      }
                    </span>
                  )}
                </button>
              </div>
              <span className="live-label">
                <span className="status-dot" />
                ON-CHAIN RECORDS
              </span>
            </div>
            {feedError && (
              <div role="alert" className="notice notice-error feed-notice">
                <strong>链上记录暂时读取失败</strong>
                <p>{feedError}</p>
                <button
                  className="text-link"
                  disabled={isLoading}
                  onClick={() => void refresh().catch(() => undefined)}
                >
                  重新读取 <Arrow />
                </button>
              </div>
            )}
            {isLoading && !entries.length ? (
              <div className="feed-empty" role="status">
                <span className="spinner" />
                <h3>正在寻找成都的链上印记…</h3>
                <p>正在读取 Devnet 交易，公开记录无需连接钱包。</p>
              </div>
            ) : onlyMine && !walletAddress ? (
              <div className="feed-empty">
                <div className="empty-icon">
                  <VibeMark />
                </div>
                <h3>你的链上回忆，从连接开始。</h3>
                <p>连接钱包后，这里会显示属于你的签到记录。</p>
                <button className="text-link" onClick={requestWalletConnection}>
                  连接我的钱包 <Arrow />
                </button>
              </div>
            ) : visibleEntries.length ? (
              <div className="entry-grid">
                {visibleEntries.map((entry) => (
                  <EntryCard
                    key={entry.signature}
                    entry={entry}
                    mine={entry.wallet === walletAddress}
                  />
                ))}
              </div>
            ) : !feedError ? (
              <div className="feed-empty">
                <Star className="empty-star" />
                <h3>
                  {onlyMine
                    ? "最近的记录里，还没找到你的印记。"
                    : "故事的第一行，留给你。"}
                </h3>
                <p>
                  {onlyMine
                    ? "完成一次签到，再点击刷新查看已确认的记录。"
                    : "最近的活动交易中还没有签到记录。留下你的第一条印记。"}
                </p>
                <a className="text-link" href="#check-in">
                  去留个印记 <Arrow />
                </a>
              </div>
            ) : null}
            <div className="feed-footer">
              <span>
                读取最近 20 笔活动索引交易，只展示已确认且格式有效的签到。
              </span>
              <a
                href={`https://explorer.solana.com/address/${EVENT_REFERENCE}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看活动链上索引 <Arrow diagonal />
              </a>
            </div>
          </section>

          <section className="about-strip" aria-label="项目说明">
            <div>
              <p className="eyebrow">A LITTLE PROOF OF BEING HERE.</p>
              <p>
                把「我来过」，
                <br />
                <strong>变成「链上见」。</strong>
              </p>
            </div>
            <div className="about-copy">
              <p>
                Proof of Vibe 是一个 Solana Devnet 签到 Demo。钱包负责签名，Memo
                记录昵称和留言，活动索引让大家的印记聚在一起。
              </p>
              <p>不用注册账号，每条签到都有独立的交易凭证。</p>
              <a
                href="https://solana.com/zh/docs/intro/quick-start"
                target="_blank"
                rel="noopener noreferrer"
              >
                探索 Solana 开发 <Arrow diagonal />
              </a>
            </div>
            <Star className="about-star" />
          </section>
        </main>

        <footer className="site-footer">
          <a className="footer-brand" href="#">
            proof of <strong>vibe.</strong>
          </a>
          <span>MADE FOR THE MOMENT. BUILT ON SOLANA.</span>
          <a
            href="https://solana.com/developers/templates/nextjs"
            target="_blank"
            rel="noopener noreferrer"
          >
            基于官方 Next.js 模板 <Arrow diagonal />
          </a>
        </footer>
      </div>

      <dialog
        ref={reviewRef}
        className="review-dialog"
        aria-labelledby="review-title"
        aria-describedby="review-description"
        onCancel={(event) => {
          event.preventDefault();
          if (status === "ready") cancel();
        }}
      >
        <div className="review-top">
          <p className="eyebrow">REVIEW BEFORE YOU SIGN</p>
          {status === "ready" && (
            <button
              className="dialog-close"
              aria-label="关闭交易预览"
              onClick={cancel}
            >
              ×
            </button>
          )}
        </div>
        <h2 id="review-title">确认你的链上印记</h2>
        <p id="review-description" className="section-description">
          请检查下方内容，再打开钱包签名。
        </p>
        <div className="simulation-badge">
          <Check />
          模拟通过<span>DEVNET</span>
        </div>
        <dl className="review-details">
          <div>
            <dt>网络</dt>
            <dd>Solana Devnet</dd>
          </div>
          <div>
            <dt>付款钱包</dt>
            <dd className="mono">{walletAddress}</dd>
          </div>
          <div>
            <dt>SOL 转账</dt>
            <dd>
              0 SOL <span>· 本人钱包零金额交易</span>
            </dd>
          </div>
          <div>
            <dt>接收地址</dt>
            <dd className="mono">{walletAddress}</dd>
          </div>
        </dl>
        <div className="review-simulation">
          <span>模拟结果与网络费估算</span>
          <p>
            {simulationSummary ||
              "模拟通过。网络费以钱包确认页为准，仅使用测试 SOL。"}
          </p>
        </div>
        <div className="review-memo">
          <span>公开 Memo 内容</span>
          <code>{memoInfo.memo}</code>
        </div>
        <p className="review-expiry">
          模拟结果短期有效。若已过期，会重新模拟并请你再次确认。
        </p>
        {transactionError && (
          <p role="status" className="inline-error">
            {transactionError}
          </p>
        )}
        {status === "ready" ? (
          <div className="review-actions">
            <button
              className="secondary-button"
              onClick={() => {
                cancel();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              返回修改
            </button>
            <button
              className="primary-button"
              onClick={() => void confirm().catch(() => undefined)}
            >
              确认并打开钱包 <Arrow />
            </button>
          </div>
        ) : (
          <div className="review-progress" role="status">
            <span className="spinner" />
            <p>{statusMessage}</p>
            <span>签名或确认期间请等待；可在钱包中取消签名。</span>
          </div>
        )}
      </dialog>
    </>
  );
}

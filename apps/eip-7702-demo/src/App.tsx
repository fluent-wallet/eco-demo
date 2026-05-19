import "./App.css";
import { useMemo, useState } from "react";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, chainId } from "./constants";

type HexString = `0x${string}`;

type AuthorizationInput = {
  eoaPK: HexString | "";
  delegatedTo: HexString | "";
  chainId: number | HexString | 0;
  data: HexString | "";
  nonce: number | undefined;
};

const DEV_SHELL_PORT = "4173";
const APP_ROUTE_SEGMENT = "eip-7702";

function getHomeHref() {
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_SHELL_PORT}/`;
  }

  const currentUrl = new URL(window.location.href);
  const pathParts = currentUrl.pathname.split("/").filter(Boolean);
  const appRouteIndex = pathParts.lastIndexOf(APP_ROUTE_SEGMENT);
  const homeParts =
    appRouteIndex >= 0
      ? pathParts.slice(0, appRouteIndex)
      : pathParts.slice(0, -1);

  currentUrl.pathname = `/${homeParts.join("/")}${
    homeParts.length > 0 ? "/" : ""
  }`;
  currentUrl.search = "";
  currentUrl.hash = "";

  return currentUrl.toString();
}

const emptyAuthorization = (): AuthorizationInput => ({
  eoaPK: "",
  delegatedTo: "",
  chainId: 0,
  data: "0x",
  nonce: undefined,
});

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

function compact(value: string | undefined) {
  if (!value) return "-";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function getExplorerTxUrl(hash: string) {
  const base =
    chainId === "8889"
      ? "https://evmtestnet-stage.confluxscan.net"
      : "https://evmtestnet.confluxscan.org";
  return `${base}/tx/${hash}`;
}

const statusLabel = {
  idle: "待操作",
  loading: "处理中",
  success: "成功",
  error: "错误",
} as const;

function App() {
  const [txSenderPK, setTxSenderPK] = useState<HexString>();
  const [to, setTo] = useState<HexString>();
  const [hash, setHash] = useState<string>();
  const [data, setData] = useState<HexString>("0x");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string>();
  const [authorizationList, setAuthorizationList] = useState<
    AuthorizationInput[]
  >([emptyAuthorization()]);

  const validAuthorizationCount = useMemo(
    () =>
      authorizationList.filter((item) => item.eoaPK && item.delegatedTo).length,
    [authorizationList],
  );
  const homeHref = getHomeHref();

  const updateAuthorization = (
    index: number,
    patch: Partial<AuthorizationInput>,
  ) => {
    setAuthorizationList((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const delegate = async () => {
    setStatus("loading");
    setError(undefined);
    setHash(undefined);

    try {
      if (!txSenderPK) {
        throw new Error("请填写 tx sender 的私钥。");
      }

      const relay = privateKeyToAccount(txSenderPK);
      const walletClient = createWalletClient({
        account: relay,
        chain,
        transport: http(),
      });

      const list = authorizationList
        .filter((item) => !!item.eoaPK && !!item.delegatedTo)
        .map(async (item) => {
          const eoa = privateKeyToAccount(item.eoaPK as HexString);
          return walletClient.signAuthorization({
            contractAddress: item.delegatedTo as HexString,
            account: eoa,
            chainId: Number(item.chainId) || 0,
            nonce: item.nonce || undefined,
          });
        });

      if (list.length === 0) {
        throw new Error("至少需要填写一组可用授权。");
      }

      const txHash = await walletClient.sendTransaction({
        authorizationList: await Promise.all(list),
        to,
        data,
      });

      setHash(txHash);
      setStatus("success");
      return txHash;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "发送交易失败。";
      setError(message);
      setStatus("error");
      return undefined;
    }
  };

  const handleFetchNonce = async (index: number) => {
    const eoaPK = authorizationList[index].eoaPK;

    try {
      setError(undefined);
      if (!eoaPK) {
        throw new Error("查询 nonce 前需要先填写 EOA 私钥。");
      }

      const eoa = privateKeyToAccount(eoaPK);
      const nonce = await publicClient.getTransactionCount({
        address: eoa.address,
      });

      updateAuthorization(index, { nonce });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "查询 nonce 失败。");
      setStatus("error");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <a className="home-link" href={homeHref} target="_top">
            返回首页
          </a>
          <div>
            <h1>EIP-7702 Demo</h1>
            <p>签名授权列表并发送 EOA 代理交易。</p>
          </div>
        </div>
        <span className="network-badge">链 ID {chainId}</span>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-heading">
              <h2>网络</h2>
              <span className="pill">当前</span>
            </div>
            <div className="stack">
              <label className="field">
                <span>链 ID</span>
                <select
                  onChange={(event) => {
                    localStorage.setItem("_7702_chainId", event.target.value);
                    window.location.reload();
                  }}
                  defaultValue={chainId}
                >
                  <option value="71">71 - Conflux eSpace 测试网</option>
                  <option value="8889">8889 - Conflux Devnet</option>
                </select>
              </label>
              <div className="kv">
                <span>可用授权数量</span>
                <code>{validAuthorizationCount}</code>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>注意事项</h2>
            </div>
            <ol className="notes-list">
              <li className="note-danger">
                pk 字段需要填写私钥（0x 开头）。页面不会保存私钥，但为了安全请只使用测试账户。
              </li>
              <li>
                delegate 后如果希望 EOA 仍然可以被转账，delegated to 指向的合约需要支持 receive 方法。可以使用
                0x96ee5ac72ab76d4fbf7207d000c0d95835c24579。
              </li>
              <li>
                如果 tx sender 和 EOA 使用同一个账户，会出现 nonce 错误。这里不做自动处理，方便测试异常 case。
              </li>
              <li>
                如果 chain id 不为 0 或当前链 ID，会出现 chain id 不匹配的报错。
              </li>
              <li>
                一次授权多个时，如果 EOA 的 pk 相同，多次授权交易 nonce 会重复，需要手动依次填写 nonce。
              </li>
              <li>
                当 tx sender 和 EOA 相同，EOA 的 nonce 需要使用最新 nonce + 1；如果同一 EOA 多次授权，从第一次授权开始依次 +1。
              </li>
            </ol>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>结果</h2>
              <span className={`pill pill-${status}`}>{statusLabel[status]}</span>
            </div>
            <div className="stack">
              {hash ? (
                <div className="kv">
                  <span>交易哈希</span>
                  <a href={getExplorerTxUrl(hash)} target="_blank" rel="noreferrer">
                    {compact(hash)}
                  </a>
                </div>
              ) : (
                <p className="muted">还没有发送交易。</p>
              )}
              {error && <p className="error-text">{error}</p>}
            </div>
          </section>
        </aside>

        <section className="workbench">
          <div className="toolbar">
            <div>
              <h2>交易构造</h2>
              <p>构造包含一个或多个 EIP-7702 授权的交易。</p>
            </div>
            <button
              className="button accent"
              disabled={status === "loading"}
              onClick={delegate}
            >
              {status === "loading" ? "发送中..." : "发送 delegate 交易"}
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>tx sender 私钥</span>
              <input
                autoComplete="off"
                onChange={(event) => setTxSenderPK(event.target.value as HexString)}
                placeholder="0x..."
                spellCheck={false}
                type="password"
              />
            </label>

            <label className="field">
              <span>to 地址</span>
              <input
                onChange={(event) => setTo(event.target.value as HexString)}
                placeholder="0x..."
                spellCheck={false}
              />
            </label>

            <label className="field form-grid-wide">
              <span>data（可选）</span>
              <input
                onChange={(event) => setData(event.target.value as HexString)}
                placeholder="0x"
                spellCheck={false}
                value={data}
              />
            </label>
          </div>

          <div className="section-heading">
            <div>
              <h2>授权列表</h2>
              <p>每一行都会为一个 EOA 签名一条授权。</p>
            </div>
            <button
              className="button secondary"
              onClick={() =>
                setAuthorizationList((current) => [
                  ...current,
                  emptyAuthorization(),
                ])
              }
            >
              添加授权
            </button>
          </div>

          <div className="authorization-list">
            {authorizationList.map((item, index) => (
              <section className="authorization-card" key={index}>
                <div className="panel-heading">
                  <h3>授权 #{index + 1}</h3>
                  {authorizationList.length > 1 && (
                    <button
                      className="icon-button"
                      onClick={() =>
                        setAuthorizationList((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      移除
                    </button>
                  )}
                </div>

                <div className="auth-grid">
                  <label className="field">
                    <span>EOA 私钥</span>
                    <input
                      autoComplete="off"
                      onChange={(event) =>
                        updateAuthorization(index, {
                          eoaPK: event.target.value as HexString,
                        })
                      }
                      placeholder="0x..."
                      spellCheck={false}
                      type="password"
                      value={item.eoaPK}
                    />
                  </label>

                  <label className="field">
                    <span>delegated to 合约</span>
                    <input
                      onChange={(event) =>
                        updateAuthorization(index, {
                          delegatedTo: event.target.value as HexString,
                        })
                      }
                      placeholder="0x96ee5ac72ab76d4fbf7207d000c0d95835c24579"
                      spellCheck={false}
                      value={item.delegatedTo}
                    />
                  </label>

                  <label className="field">
                    <span>chain id（可选）</span>
                    <input
                      onChange={(event) =>
                        updateAuthorization(index, {
                          chainId: event.target.value as HexString,
                        })
                      }
                      placeholder="0 或当前链 ID"
                      type="number"
                      value={item.chainId}
                    />
                  </label>

                  <label className="field">
                    <span>nonce（可选）</span>
                    <div className="inline-control">
                      <input
                        onChange={(event) =>
                          updateAuthorization(index, {
                            nonce:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                        placeholder="可选"
                        type="number"
                        value={item.nonce ?? ""}
                      />
                      <button
                        className="icon-button"
                        onClick={() => handleFetchNonce(index)}
                      >
                        查询
                      </button>
                    </div>
                  </label>
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

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
        throw new Error("tx sender pk is required.");
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
        throw new Error("At least one authorization is required.");
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
        caught instanceof Error ? caught.message : "Failed to send transaction.";
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
        throw new Error("EOA private key is required before fetching nonce.");
      }

      const eoa = privateKeyToAccount(eoaPK);
      const nonce = await publicClient.getTransactionCount({
        address: eoa.address,
      });

      updateAuthorization(index, { nonce });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to fetch nonce.");
      setStatus("error");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>EIP-7702 Demo</h1>
          <p>Sign authorization lists and submit delegated EOA transactions.</p>
        </div>
        <span className="network-badge">Chain {chainId}</span>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="panel">
            <div className="panel-heading">
              <h2>Network</h2>
              <span className="pill">Active</span>
            </div>
            <div className="stack">
              <label className="field">
                <span>Chain ID</span>
                <select
                  onChange={(event) => {
                    localStorage.setItem("_7702_chainId", event.target.value);
                    window.location.reload();
                  }}
                  defaultValue={chainId}
                >
                  <option value="71">71 - Conflux eSpace Testnet</option>
                  <option value="8889">8889 - Conflux Devnet</option>
                </select>
              </label>
              <div className="kv">
                <span>Authorization count</span>
                <code>{validAuthorizationCount}</code>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Safety Notes</h2>
            </div>
            <ol className="notes-list">
              <li>Use only test-account private keys. The app does not persist them.</li>
              <li>
                If the EOA still needs to receive transfers after delegation,
                delegate to code with a receive method.
              </li>
              <li>
                When tx sender and EOA are the same account, manually set nonce to
                latest nonce + 1.
              </li>
              <li>
                Multiple authorizations for the same EOA need sequential nonce
                values.
              </li>
            </ol>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Result</h2>
              <span className={`pill pill-${status}`}>{status}</span>
            </div>
            <div className="stack">
              {hash ? (
                <div className="kv">
                  <span>Transaction hash</span>
                  <a href={getExplorerTxUrl(hash)} target="_blank" rel="noreferrer">
                    {compact(hash)}
                  </a>
                </div>
              ) : (
                <p className="muted">No transaction sent yet.</p>
              )}
              {error && <p className="error-text">{error}</p>}
            </div>
          </section>
        </aside>

        <section className="workbench">
          <div className="toolbar">
            <div>
              <h2>Transaction Builder</h2>
              <p>Build one transaction with one or more EIP-7702 authorizations.</p>
            </div>
            <button
              className="button accent"
              disabled={status === "loading"}
              onClick={delegate}
            >
              {status === "loading" ? "Sending..." : "Delegate"}
            </button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Tx sender private key</span>
              <input
                autoComplete="off"
                onChange={(event) => setTxSenderPK(event.target.value as HexString)}
                placeholder="0x..."
                spellCheck={false}
                type="password"
              />
            </label>

            <label className="field">
              <span>To</span>
              <input
                onChange={(event) => setTo(event.target.value as HexString)}
                placeholder="0x..."
                spellCheck={false}
              />
            </label>

            <label className="field form-grid-wide">
              <span>Calldata</span>
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
              <h2>Authorization List</h2>
              <p>Each row signs an authorization for one EOA.</p>
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
              Add Authorization
            </button>
          </div>

          <div className="authorization-list">
            {authorizationList.map((item, index) => (
              <section className="authorization-card" key={index}>
                <div className="panel-heading">
                  <h3>Authorization #{index + 1}</h3>
                  {authorizationList.length > 1 && (
                    <button
                      className="icon-button"
                      onClick={() =>
                        setAuthorizationList((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="auth-grid">
                  <label className="field">
                    <span>EOA private key</span>
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
                    <span>Delegated to</span>
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
                    <span>Chain ID</span>
                    <input
                      onChange={(event) =>
                        updateAuthorization(index, {
                          chainId: event.target.value as HexString,
                        })
                      }
                      placeholder="0 or current chain"
                      type="number"
                      value={item.chainId}
                    />
                  </label>

                  <label className="field">
                    <span>Nonce</span>
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
                        placeholder="optional"
                        type="number"
                        value={item.nonce ?? ""}
                      />
                      <button
                        className="icon-button"
                        onClick={() => handleFetchNonce(index)}
                      >
                        Fetch
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

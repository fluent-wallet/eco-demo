import "./App.css";
import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";
import { chain, chainId } from "./constants";

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

function App() {
  const [txSenderPK, setTxSenderPK] = useState<`0x${string}`>();
  const [to, setTo] = useState<`0x${string}`>();
  const [hash, setHash] = useState<string>();
  const [data, setData] = useState<`0x${string}`>();
  const [authorizationList, setAuthorizationList] = useState<
    {
      eoaPK: `0x${string}` | "";
      delegatedTo: `0x${string}` | "";
      chainId: number | `0x${string}` | 0;
      data: `0x${string}` | "";
      nonce: number | undefined;
    }[]
  >([{ eoaPK: "", delegatedTo: "", chainId: 0, data: "0x", nonce: undefined }]);
  const handleTxSenderPK = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTxSenderPK(e.target.value as `0x${string}`);
  };
  const handleEoaPK = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    setAuthorizationList(
      authorizationList.map((item, i) => {
        if (i === index) {
          return { ...item, eoaPK: e.target.value as `0x${string}` };
        }
        return item;
      })
    );
  };
  const handleDelegatedTo = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    setAuthorizationList(
      authorizationList.map((item, i) => {
        if (i === index) {
          return { ...item, delegatedTo: e.target.value as `0x${string}` };
        }
        return item;
      })
    );
  };
  const handleChainId = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    setAuthorizationList(
      authorizationList.map((item, i) => {
        if (i === index) {
          return { ...item, chainId: e.target.value as `0x${string}` };
        }
        return item;
      })
    );
  };
  const handleNonce = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    setAuthorizationList(
      authorizationList.map((item, i) => {
        if (i === index) {
          return { ...item, nonce: Number(e.target.value) };
        }
        return item;
      })
    );
  };
  const handleData = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData(e.target.value as `0x${string}`);
  };
  const handleTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTo(e.target.value as `0x${string}`);
  };
  const delegate = async () => {
    if (!txSenderPK) {
      alert("请输入txSenderPK");
      return;
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
        const eoa = privateKeyToAccount(item.eoaPK as `0x${string}`);
        const authorization = await walletClient.signAuthorization({
          contractAddress: item.delegatedTo as `0x${string}`,
          account: eoa,
          chainId: Number(item.chainId) || 0,
          nonce: item.nonce || undefined,
        });
        return authorization;
      });
    if (list.length === 0) {
      alert("无可用授权");
      return;
    }

    const hash = await walletClient.sendTransaction({
      authorizationList: await Promise.all(list),
      to: to,
      data: data,
    });
    setHash(hash);
    return hash;
  };
  const handleFetchNonce = async (index: number) => {
    const eoaPK = authorizationList[index].eoaPK;
    if (!eoaPK) {
      alert("eoa pk is required");
      return;
    }
    const eoa = privateKeyToAccount(eoaPK);
    const nonce = await publicClient.getTransactionCount({
      address: eoa.address,
    });
    setAuthorizationList(
      authorizationList.map((item) => ({ ...item, nonce: nonce }))
    );
  };
  return (
    <div className="App">
      <select
        onChange={(e) => {
          localStorage.setItem("_7702_chainId", e.target.value);
          window.location.reload();
        }}
        defaultValue={chainId}
      >
        <option value="71">71</option>
        <option value="8889">8889</option>
      </select>
      <div>
        <h1>TIPS</h1>
        <div>
          <p style={{ color: "red" }}>
            1.
            pk字段需要填写私钥（0x开头），项目不保存，但是为了安全请使用测试账户的私钥
          </p>
          <p>
            2. delegate 后如果希望eoa仍然可以被转账，需要delegated
            to支持receive方法，可以使用0x96ee5ac72ab76d4fbf7207d000c0d95835c24579合约
          </p>
          <p>
            3. 如果tx sender 和
            eoa使用同一个账户，会出现nonce错误，没有进行处理，方便进行异常case测试
          </p>
          <p>4. 如果chain id不为0/{chainId}，会出现chain id不匹配的报错，同3</p>
          <p>
            5. delegate后，如果想要调用eoa的方法，可以去scan上通过delegated
            code页面进行调用，这里不额外提供
          </p>
          <p>
            6.
            一次授权多个时，如果eoa的pk相同，多次授权交易nonce会重复，导致只有其中一笔授权交易成功
          </p>
          <p>
            7. 当tx sender 和 eoa 相同，或者交易中 eoa 多次授权，会出现 nonce
            重复报错；此时可以通过authorizationList里的【fetch
            nonce】按钮查询eoa的最新nonce，手动填写nonce。填写nonce的规则为：如果tx
            sender和eoa相同，eoa的nonce需要固定+1；如果eoa有多次授权，从第一次授权开始依次+1
          </p>
        </div>
      </div>
      <div style={{ marginTop: "20px", padding: "10px" }}>
        <h3>Form</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          <label>tx sender pk</label>
          <input style={{ flex: 1 }} type="text" onChange={handleTxSenderPK} />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <label>data(可选)</label>
          <input
            style={{ flex: 1 }}
            type="text"
            onChange={handleData}
            defaultValue="0x"
          />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <label>to</label>
          <input
            style={{ flex: 1 }}
            type="text"
            onChange={handleTo}
            defaultValue="0x"
          />
        </div>
        <h3>
          <span>authorizationList</span>
          <button
            style={{ marginLeft: "10px", cursor: "pointer" }}
            onClick={() =>
              setAuthorizationList([
                ...authorizationList,
                {
                  eoaPK: "",
                  delegatedTo: "",
                  chainId: 0,
                  data: "0x",
                  nonce: undefined,
                },
              ])
            }
          >
            add
          </button>
        </h3>
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexDirection: "column",
            border: "1px solid #ccc",
            padding: "10px",
          }}
        >
          {authorizationList.map((item, index) => (
            <div key={index} style={{ borderBottom: "1px solid #ccc" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <label>eoa pk</label>
                <input
                  style={{ flex: 1 }}
                  type="text"
                  onChange={(e) => handleEoaPK(e, index)}
                  value={item.eoaPK}
                />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <label>delegated to</label>
                <input
                  style={{ flex: 1 }}
                  type="text"
                  onChange={(e) => handleDelegatedTo(e, index)}
                  value={item.delegatedTo}
                />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <label>chain id(可选)</label>
                <input
                  style={{ flex: 1 }}
                  type="number"
                  onChange={(e) => handleChainId(e, index)}
                  value={item.chainId}
                />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <label>nonce(可选)</label>
                <input
                  style={{ flex: 1 }}
                  type="text"
                  onChange={(e) => handleNonce(e, index)}
                  value={item.nonce}
                />
                <button
                  style={{ cursor: "pointer" }}
                  onClick={() => handleFetchNonce(index)}
                >
                  fetch nonce
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={delegate}>delegate</button>
      </div>
      {hash && (
        <div>
          <p>
            <a
              href={`https://evmtestnet-stage.confluxscan.net/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {hash}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

export default App;

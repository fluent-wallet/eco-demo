/* eslint-disable @typescript-eslint/no-explicit-any */
import SDK from "js-conflux-sdk";

const CFX: any = new SDK.Conflux({
  url: "https://net8889eth-cfxbridge.confluxrpc.com",
  networkId: 8889,
});

const request = async <T>(method: string, ...args: any[]): Promise<T> => {
  try {
    const [namespace, m] = method.split("_");
    // 断言 CFX[namespace][m] 为一个函数，并调用它
    if (namespace && m && typeof CFX[namespace][m] === "function") {
      return await CFX[namespace][m](...args);
    } else {
      throw new Error(
        `Method ${m} is not a function in namespace ${namespace}`
      );
    }
  } catch (e: unknown) {
    console.error("Unexpected error", e);
    throw e;
  }
};

export const getCode = async (...args: unknown[]) => {
  return request("cfx_getCode", ...args);
};

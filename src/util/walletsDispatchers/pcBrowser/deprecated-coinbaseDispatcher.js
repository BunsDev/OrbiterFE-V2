
/**
 * Warning!!!!!!!!!!!!!!!!!!
 * this file will be deprecated
 * please head over to the standardWalletLoader.js to get more information
 */
import { COINBASE } from "../constants";
import { universalWalletInitHandler } from "./standardWalletAPI";
import { withPerformInterruptWallet } from "../utils";

/**
 * @deprecated
 */
export const coinbaseDispatcherOnInit = () => {
    // because of coinbase supports mobile env (app?),
    // so i am going to differentiate the env, 
    // convenient for the feature maintenance
    return coinbaseDispatcherOnBrowserInit();
}

// coinbase init in browser
/**
 * @deprecated
 */
const coinbaseDispatcherOnBrowserInit = () => {
    universalWalletInitHandler(COINBASE);
    // ---------------- deprecated ----------------------------
    // const coinbaseProvider = findMatchWeb3ProviderByWalletType(COINBASE);
    // // request coinbase extension
    // coinbaseProvider.request({ method: "eth_requestAccounts" }).then(result => {
    //     // init global stats
    //     const legalWalletConfig = {
    //         walletType: COINBASE,
    //         loginSuccess: true,
    //         walletPayload: {
    //             walletAddress: result[0]
    //         }
    //     }
    //     updateGlobalSelectWalletConf(legalWalletConfig.walletType, legalWalletConfig.walletPayload, true);
    //     modifyLocalLoginInfo(legalWalletConfig);
    // }).catch(err => {
    // })
}
/**
 * @deprecated
 */
export const coinbaseDispatcherOnDisconnect = withPerformInterruptWallet(() => {});
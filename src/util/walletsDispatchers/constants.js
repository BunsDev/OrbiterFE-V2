export const METAMASK = 'MetaMask' // metamask wallet constant
export const TALLYHO = 'Taho' // tally wallet constant
export const BLOCKWALLET = 'BlockWallet' // BlockWallet wallet constant
export const WALLETCONNECT = 'WalletConnect' // walletConnect wallet constant
export const COINBASE = 'Coinbase' // coinbase wallet constant
export const BRAVE = 'Brave' // brave wallet constant
export const OKXWALLET = 'OKXWallet' // okx wallet constant
export const ZERION = 'Zerion' // zerion wallet constant
export const BIT_KEEP = 'BitgetWallet' // bitKeep app name
export const IM_TOKEN_APP = 'imTokenApp' // imToken app name
export const BIT_KEEP_APP = 'BitgetWallet' // bitKeep app name
export const COINBASE_APP = 'coinbaseApp' // coinbase app name
export const METAMASK_APP = 'metamaskApp' // metamask app name
export const TOKEN_POCKET_APP = 'TokenPocket' // token pocket app name
export const LOCALLOGINDATA = 'localLoginData' // mainly used in localStorage for store the information if any wallets have been logged in
export const BRAVE_APP = 'braveApp' // brave wallet constant
export const LOOPRING_APP = 'loopringApp' // brave wallet constant
export const ZERION_APP = 'ZerionApp' // zerion wallet constant

export const CURRENT_SUPPORT_WALLET = [
  METAMASK,
  WALLETCONNECT,
  COINBASE,
  BIT_KEEP,
  OKXWALLET,
  IM_TOKEN_APP,
  ZERION,
  TOKEN_POCKET_APP,
  BLOCKWALLET,
  TALLYHO,
].map((item) => item.toLocaleLowerCase())

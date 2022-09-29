import { web3State } from "../composition/hooks";
import { compatibleGlobalWalletConf } from './walletsResponsiveData'
import { ref } from './'

export const linkWallet = ref('')
export const defaultMaker = ref('')
export const myMaker = ref('')

export function showAddress() {
  var address = compatibleGlobalWalletConf.value.walletPayload.walletAddress
  linkWallet.value = address
  if (address && address.length > 5) {
    var subStr1 = address.substr(0, 6)
    var subStr2 = address.substr(address.length - 4, 4)
    return subStr1 + '...' + subStr2
  }
  return ''
}
export function starkAddress() {
  var stark = web3State.starkNet.starkNetAddress
  if (stark && stark.length > 5) {
    var subStr1 = stark.substr(0, 6)
    var subStr2 = stark.substr(stark.length - 4, 4)
    return subStr1 + '...' + subStr2
  }
  return 'not connected'
}

import Bignumber from 'bignumber.js'
import Web3 from 'web3'
import thirdapi from '../../core/actions/thirdapi'
import config from '../../core/utils/config'
import orbiterCore from '../../orbiterCore'
import util from '../../util/util'
import { store } from '../../store'
import { Coin_ABI } from '../constants/contract/contract.js'
import { localWeb3 } from '../constants/contract/localWeb3.js'
import {
  getStarkMakerAddress,
  getProviderByChainId,
  getStarkNetValidAddress,
} from '../constants/starknet/helper'
import { IMXHelper } from '../immutablex/imx_helper'
import { IMXListen } from '../immutablex/imx_listen'
import { EthListen } from './eth_listen'
import { factoryStarknetListen } from './starknet_listen'
import loopring from '../../core/actions/loopring'
import { CrossAddress } from '../cross_address'
import { DydxListen } from '../dydx/dydx_listen'
import { compatibleGlobalWalletConf } from '../../composition/walletsResponsiveData'
import { getTimeStampInfo } from './get_tx_by_hash'
import {
  lpApiKey,
  lpAccountInfo,
  web3State,
  transferDataState,
} from '../../composition/hooks'

import zkspace from '../../core/actions/zkspace'
import { ArNovaListen } from '../ar_nova/ar_listen'

let startBlockNumber = ''

const storeUpdateProceedState = (state) => {
  store.commit('updateProceedState', state)
}

async function confirmUserTransaction(
  localChainID,
  makerInfo,
  txHash,
  confirmations = 1
) {
  let fromTokenAddress = makerInfo.t1Address
  let toLocalChainID = makerInfo.c2ID
  if (localChainID === makerInfo.c2ID) {
    fromTokenAddress = makerInfo.t2Address
    toLocalChainID = makerInfo.c1ID
  }
  // Get current toChain blockNumber
  const _web3 = localWeb3(toLocalChainID)
  if (_web3) {
    startBlockNumber = await _web3.eth.getBlockNumber()
  }

  store.commit('updateProceedingUserTransferLocalChainID', localChainID)
  store.commit('updateProceedingUserTransferTxid', txHash)
  setTimeout(async () => {
    if (!isCurrentTransaction(txHash)) {
      return
    }
    if (localChainID === 3 || localChainID === 33) {
      var req = {
        txHash: txHash,
        localChainID: localChainID,
      }
      try {
        let zkTransactionData = await thirdapi.getZKTransactionData(req)
        if (
          zkTransactionData.status === 'success' &&
          zkTransactionData.result.tx.failReason === null &&
          zkTransactionData.result.tx.op.type === 'Transfer' &&
          (zkTransactionData.result.tx.status === 'committed' ||
            zkTransactionData.result.tx.status === 'finalized')
        ) {
          let time = zkTransactionData.result.tx.createdAt
          let zk_amount = orbiterCore.getRAmountFromTAmount(
            localChainID,
            zkTransactionData.result.tx.op.amount
          ).rAmount
          let zk_nonce = zkTransactionData.result.tx.op.nonce.toString()
          let zk_SendRAmount = orbiterCore.getToAmountFromUserAmount(
            new Bignumber(zk_amount).dividedBy(
              new Bignumber(10 ** makerInfo.precision)
            ),
            makerInfo,
            true
          )
          let zk_makerTransferChainID =
            localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
          var zk_amountToSend = orbiterCore.getTAmountFromRAmount(
            zk_makerTransferChainID,
            zk_SendRAmount,
            zk_nonce
          ).tAmount
          if (!isCurrentTransaction(txHash)) {
            return
          }
          store.commit('updateProceedingUserTransferTimeStamp', time)
          const compareProceedTxTimeStr = (
            Date.parse(new Date(time)) / 1000 -
            1800
          ).toString()
          storeUpdateProceedState(3)
          startScanMakerTransfer(
            txHash,
            zk_makerTransferChainID,
            makerInfo,
            zkTransactionData.result.tx.op.to,
            zkTransactionData.result.tx.op.from,
            zk_amountToSend,
            compareProceedTxTimeStr,
            zk_nonce
          )
          return
        }
      } catch (error) {
        console.warn('error =', error)
        throw 'getZKTransactionDataError'
      }
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }

    // starknet
    if (localChainID == 4 || localChainID == 44) {
      try {
        const starknetProvider = getProviderByChainId(localChainID)
        const resp = await starknetProvider.getTransaction(txHash)
        if (
          resp.status == 'ACCEPTED_ON_L1' ||
          resp.status == 'ACCEPTED_ON_L2' ||
          resp.status == 'PENDING'
        ) {
          const transaction = resp.transaction
          const block = await starknetProvider.getBlock()
          const sn_amount = orbiterCore.getRAmountFromTAmount(
            localChainID,
            new Bignumber(transaction.calldata?.[8])
          ).rAmount
          const sn_nonce = String(
            transaction.nonce || new Bignumber(transaction.calldata?.[11]) || 0
          )
          const sn_SendRAmount = orbiterCore.getToAmountFromUserAmount(
            new Bignumber(sn_amount).dividedBy(
              new Bignumber(10 ** makerInfo.precision)
            ),
            makerInfo,
            true
          )
          const sn_makerTransferChainID =
            localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
          const sn_amountToSend = orbiterCore.getTAmountFromRAmount(
            sn_makerTransferChainID,
            sn_SendRAmount,
            sn_nonce
          ).tAmount
          if (!isCurrentTransaction(txHash)) {
            return
          }
          store.commit('updateProceedingUserTransferTimeStamp', block.timestamp)
          const timeStr = block.timestamp.toString()
          let compareProceedTxTimeStr = timeStr.slice(0, 10)
          compareProceedTxTimeStr = Number(
            compareProceedTxTimeStr - 1800
          ).toString()
          storeUpdateProceedState(3)
          startScanMakerTransfer(
            txHash,
            sn_makerTransferChainID,
            makerInfo,
            makerInfo.makerAddress,
            web3State.coinbase,
            sn_amountToSend,
            compareProceedTxTimeStr,
            sn_nonce
          )
          return
        }
      } catch (error) {
        console.warn('error =', error)
        throw 'getStarknetTransactionDataError'
      }
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }

    // immutablex
    if (localChainID == 8 || localChainID == 88) {
      try {
        const imxHelper = new IMXHelper(localChainID)
        const imxClient = await imxHelper.getImmutableXClient()
        const transfer = await imxClient.getTransfer({ id: txHash })
        if (transfer.status.toLowerCase() == 'success') {
          const imx_amount = orbiterCore.getRAmountFromTAmount(
            localChainID,
            transfer.token.data.quantity + ''
          ).rAmount
          const imx_nonce = imxHelper.timestampToNonce(
            transfer.timestamp.getTime()
          )
          const imx_SendRAmount = orbiterCore.getToAmountFromUserAmount(
            new Bignumber(imx_amount).dividedBy(
              new Bignumber(10 ** makerInfo.precision)
            ),
            makerInfo,
            true
          )
          const imx_makerTransferChainID =
            localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
          const imx_amountToSend = orbiterCore.getTAmountFromRAmount(
            imx_makerTransferChainID,
            imx_SendRAmount,
            imx_nonce
          ).tAmount
          if (!isCurrentTransaction(txHash)) {
            return
          }
          store.commit(
            'updateProceedingUserTransferTimeStamp',
            transfer.timestamp
          )
          let compareProceedTxTimeStr =
            Date.parse(new Date(transfer.timestamp)) / 1000
          compareProceedTxTimeStr = Number(
            compareProceedTxTimeStr - 1800
          ).toString()
          storeUpdateProceedState(3)
          startScanMakerTransfer(
            txHash,
            imx_makerTransferChainID,
            makerInfo,
            makerInfo.makerAddress,
            web3State.coinbase,
            imx_amountToSend,
            compareProceedTxTimeStr,
            imx_nonce
          )
          return
        }
      } catch (error) {
        console.warn('getImmutableXTransactionData Error =', error)
        throw new Error('getImmutableXTransactionDataError')
      }
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }
    // loopring
    if (localChainID == 9 || localChainID == 99) {
      let apiKey = lpApiKey.value
      let acc = lpAccountInfo.value
      const GetUserTransferListRequest = {
        accountId: acc.accountId,
        hashes: txHash,
      }

      const userApi = loopring.getUserAPI(localChainID)
      try {
        const LPTransferResult = await userApi.getUserTransferList(
          GetUserTransferListRequest,
          apiKey
        )
        if (
          LPTransferResult.totalNum === 1 &&
          LPTransferResult.userTransfers?.length === 1
        ) {
          let lpTransaction = LPTransferResult.userTransfers[0]
          if (
            (lpTransaction.status == 'processed' ||
              lpTransaction.status == 'received') &&
            lpTransaction.txType == 'TRANSFER'
          ) {
            let time = lpTransaction.timestamp
            let lp_amount = orbiterCore.getRAmountFromTAmount(
              localChainID,
              lpTransaction.amount
            ).rAmount
            let lp_nonce = (lpTransaction.storageInfo.storageId - 1) / 2 + ''
            let lp_SendRAmount = orbiterCore.getToAmountFromUserAmount(
              new Bignumber(lp_amount).dividedBy(
                new Bignumber(10 ** makerInfo.precision)
              ),
              makerInfo,
              true
            )
            let lp_makerTransferChainID =
              localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
            var lp_amountToSend = orbiterCore.getTAmountFromRAmount(
              lp_makerTransferChainID,
              lp_SendRAmount,
              lp_nonce
            ).tAmount
            if (!isCurrentTransaction(txHash)) {
              return
            }
            store.commit('updateProceedingUserTransferTimeStamp', time)
            const timeStr = time.toString()
            let realTimeStr = timeStr.slice(0, 10)
            realTimeStr = Number(realTimeStr - 1800).toString()
            storeUpdateProceedState(3)
            startScanMakerTransfer(
              txHash,
              lp_makerTransferChainID,
              makerInfo,
              lpTransaction.receiverAddress,
              lpTransaction.senderAddress,
              lp_amountToSend,
              realTimeStr,
              lp_nonce
            )
            return
          }
        }
      } catch (error) {
        console.warn('error =', error)
        throw 'getLPTransactionDataError'
      }
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }

    if (localChainID === 12 || localChainID === 512) {
      try {
        let zkspaceTransactionData = await zkspace.getZKSpaceTransactionData(
          localChainID,
          txHash
        )
        if (
          zkspaceTransactionData.success === true &&
          zkspaceTransactionData.data.success === true &&
          zkspaceTransactionData.data.tx_type === 'Transfer' &&
          (zkspaceTransactionData.data.status === 'verified' ||
            zkspaceTransactionData.data.status === 'pending')
        ) {
          let time = zkspaceTransactionData.data.created_at
          let zkspac_amount = orbiterCore.getRAmountFromTAmount(
            localChainID,
            new Bignumber(zkspaceTransactionData.data.amount).multipliedBy(
              new Bignumber(10 ** makerInfo.precision)
            )
          ).rAmount
          let zkspace_nonce = zkspaceTransactionData.data.nonce.toString()
          let zkspace_SendRAmount = orbiterCore.getToAmountFromUserAmount(
            new Bignumber(zkspac_amount).dividedBy(
              new Bignumber(10 ** makerInfo.precision)
            ),
            makerInfo,
            true
          )
          let zkspace_makerTransferChainID =
            localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
          var zkspace_amountToSend = orbiterCore.getTAmountFromRAmount(
            zkspace_makerTransferChainID,
            zkspace_SendRAmount,
            zkspace_nonce
          ).tAmount
          if (!isCurrentTransaction(txHash)) {
            return
          }
          store.commit('updateProceedingUserTransferTimeStamp', time)
          const timeStr = time.toString()
          let realTimeStr = timeStr.slice(0, 10)
          realTimeStr = Number(realTimeStr - 1800).toString()
          storeUpdateProceedState(3)
          startScanMakerTransfer(
            txHash,
            zkspace_makerTransferChainID,
            makerInfo,
            zkspaceTransactionData.data.to,
            zkspaceTransactionData.data.from,
            zkspace_amountToSend,
            realTimeStr,
            zkspace_nonce
          )
          return
        }
      } catch (error) {
        console.warn('error =', error)
        throw 'getZKTransactionDataError'
      }
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }
    // EVM chains
    // main & arbitrum
    let trxConfirmations = await getConfirmations(localChainID, txHash)
    console.log(trxConfirmations, '==');
    if (localChainID == 13 || localChainID===513) {
      trxConfirmations.confirmations = 3;
    }
    if (!trxConfirmations) {
      return confirmUserTransaction(
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }
    const trx = trxConfirmations.trx
    if (!isCurrentTransaction(txHash)) {
      return
    }
    store.commit(
      'updateProceedingUserTransferTimeStamp',
      trxConfirmations.timestamp
    )
    console.warn(
      'Transaction with hash ' +
        txHash +
        ' has ' +
        trxConfirmations.confirmations +
        ' confirmation(s)'
    )

    // ERC20's transfer input length is 138(include 0x), when the length > 138, it is cross address transfer
    let amountStr = '0'
    let startScanMakerTransferFromAddress = ''
    if (trx.input.length <= 138) {
      if (util.isEthTokenAddress(fromTokenAddress)) {
        amountStr = Web3.utils.hexToNumberString(Web3.utils.toHex(trx.value))
        startScanMakerTransferFromAddress = trx.to
      } else {
        const amountHex = '0x' + trx.input.slice(74)
        amountStr = Web3.utils.hexToNumberString(amountHex)
        startScanMakerTransferFromAddress = '0x' + trx.input.slice(34, 74)
      }
    } else if (localChainID == 14 || localChainID == 514) {
      const makerAddress = makerInfo.makerAddress
      const theMakerAddress = makerAddress
        .toLowerCase()
        .substr(2, makerAddress.length - 1)
      let amountIndex = 0
      const thekeyIndex = trx.input.indexOf(theMakerAddress)
      if (thekeyIndex > -1) {
        amountIndex = thekeyIndex + theMakerAddress.length
        const hexAmount = trx.input.slice(amountIndex, amountIndex + 64)
        amountStr = Web3.utils.hexToNumberString('0x' + hexAmount)
        startScanMakerTransferFromAddress = makerAddress
      } else {
        console.warn('from zk2 the amount is incorrect')
        return
      }
    } else {
      let inputData
      // Parse input data
      if (util.isEthTokenAddress(fromTokenAddress)) {
        inputData = CrossAddress.parseTransferInput(trx.input)
        inputData.amount = trx.value
      } else {
        inputData = CrossAddress.parseTransferERC20Input(trx.input)
      }
      if (!inputData.ext?.value) {
        return
      }
      startScanMakerTransferFromAddress = inputData.to
      if (typeof inputData.amount == 'string') {
        amountStr = Number(inputData.amount) + ''
      } else {
        amountStr = inputData.amount.toString() + ''
      }
    }
    var amount = orbiterCore.getRAmountFromTAmount(
      localChainID,
      amountStr
    ).rAmount

    if (
      trxConfirmations.confirmations > 0 &&
      trxConfirmations.confirmations < confirmations
    ) {
      if (!isCurrentTransaction(txHash)) {
        return
      }
      storeUpdateProceedState(2)
    }
    if (trxConfirmations.confirmations >= confirmations) {
      if (!isCurrentTransaction(txHash)) {
        return
      }
      storeUpdateProceedState(3)
      const nonce = trx.nonce.toString()
      const sendRAmount = orbiterCore.getToAmountFromUserAmount(
        new Bignumber(amount).dividedBy(
          new Bignumber(10 ** makerInfo.precision)
        ),
        makerInfo,
        true
      )
      const makerTransferChainID =
        localChainID === makerInfo.c1ID ? makerInfo.c2ID : makerInfo.c1ID
      const amountToSend = orbiterCore.getTAmountFromRAmount(
        makerTransferChainID,
        sendRAmount,
        nonce
      ).tAmount
      const { transferExt } = transferDataState
      let toAddress = trx.from
      if (transferExt?.value) {
        toAddress = transferExt.value
      }
      const timeStr = trxConfirmations.timestamp.toString()
      let realTimeStr = timeStr.slice(0, 10)
      realTimeStr = Number(realTimeStr - 1800).toString()
      startScanMakerTransfer(
        txHash,
        makerTransferChainID,
        makerInfo,
        startScanMakerTransferFromAddress,
        toAddress,
        amountToSend,
        realTimeStr,
        nonce,
        trx.from
      )
      return
    }
    return confirmUserTransaction(
      localChainID,
      makerInfo,
      txHash,
      confirmations
    )
  }, 10 * 1000)
}

function ScanZKMakerTransfer(
  transactionID,
  localChainID,
  makerInfo,
  from,
  to,
  amount,
  timeStampStr
) {
  setTimeout(async () => {
    if (!isCurrentTransaction(transactionID)) {
      return
    }
    let req = {
      localChainID: localChainID,
      account: from,
      from: 'latest',
      limit: 30,
      direction: 'older',
    }
    try {
      let zkTransactions = await thirdapi.getZKInfo(req)
      let zkTransactionList
      if (
        zkTransactions.status === 'success' &&
        zkTransactions.result.list.length !== 0
      ) {
        zkTransactionList = zkTransactions.result.list
      }
      for (let index = 0; index < zkTransactionList.length; index++) {
        const zkInfo = zkTransactionList[index]
        if (
          zkInfo.failReason === null &&
          zkInfo.op.type == 'Transfer' &&
          zkInfo.op.from?.toLowerCase() == from.toLowerCase() &&
          zkInfo.op.to?.toLowerCase() == to.toLowerCase() &&
          zkInfo.op.amount === amount
        ) {
          if (
            Number(timeStampStr) >
            Date.parse(new Date(zkInfo.createdAt)) / 1000
          ) {
            return
          }
          let zkTokenList =
            localChainID === 3
              ? store.state.zktokenList.mainnet
              : store.state.zktokenList.rinkeby
          let tokenAddress =
            localChainID === makerInfo.c1ID
              ? makerInfo.t1Address
              : makerInfo.t2Address
          var tokenList = zkTokenList.filter(
            (item) => item.address === tokenAddress
          )
          let resultToken = tokenList.length > 0 ? tokenList[0] : null
          if (!resultToken) {
            break
          }
          if (zkInfo.op.token !== resultToken.id) {
            break
          }
          if (!isCurrentTransaction(transactionID)) {
            return
          }
          store.commit('updateProceedingMakerTransferTxid', zkInfo.txHash)
          storeUpdateProceedState(4)
          if (zkInfo.status === 'committed' || zkInfo.status === 'finalized') {
            storeUpdateProceedState(5)
            return
          }
        }
      }
    } catch (error) {
      console.warn('getZKTransactionListError =', error)
    }
    return ScanZKMakerTransfer(
      transactionID,
      localChainID,
      makerInfo,
      from,
      to,
      amount
    )
  }, 10 * 1000)
}

function ScanZKSpaceMakerTransfer(
  transactionID,
  localChainID,
  makerInfo,
  from,
  to,
  amount
  // timeStampStr
) {
  let startPoint = 0
  setTimeout(async () => {
    if (!isCurrentTransaction(transactionID)) {
      return
    }
    const zksTokenInfos =
      localChainID === 12
        ? store.state.zksTokenList.mainnet
        : store.state.zksTokenList.rinkeby
    const tokenAddress =
      localChainID === makerInfo.c1ID
        ? makerInfo.t1Address
        : makerInfo.t2Address
    const tokenInfo = zksTokenInfos.find((item) => item.address == tokenAddress)
    const tokenId = tokenInfo ? tokenInfo.id : 0

    try {
      let zksTransactions = await zkspace.getZKSapceTxList(
        from,
        localChainID,
        startPoint,
        tokenId,
        50
      )

      if (zksTransactions.success && zksTransactions.data?.data?.length !== 0) {
        let transacionts = zksTransactions.data.data
        startPoint = transacionts.length == 50 ? startPoint + 50 : 0
        for (let index = 0; index < transacionts.length; index++) {
          const zkspaceTransaction = transacionts[index]
          if (
            zkspaceTransaction?.tx_type == 'Transfer' &&
            zkspaceTransaction?.fail_reason == '' &&
            (zkspaceTransaction?.from?.toLowerCase() == from.toLowerCase() ||
              zkspaceTransaction?.to?.toLowerCase() == to.toLowerCase()) &&
            zkspaceTransaction.token.symbol == tokenInfo.symbol &&
            new Bignumber(zkspaceTransaction.amount)
              .multipliedBy(10 ** makerInfo.precision)
              .toString() == amount
          ) {
            if (!isCurrentTransaction(transactionID)) {
              return
            }
            store.commit(
              'updateProceedingMakerTransferTxid',
              zkspaceTransaction.tx_hash
            )
            if (
              zkspaceTransaction.status === 'pending' ||
              zkspaceTransaction.status === 'verified'
            ) {
              storeUpdateProceedState(5)
              return
            }
          }
        }
      }
    } catch (error) {
      console.warn('error =', error)
      throw 'getZKSTransactionListError'
    }
    return ScanZKSpaceMakerTransfer(
      transactionID,
      localChainID,
      makerInfo,
      from,
      to,
      amount
    )
  }, 10 * 1000)
}

function startScanMakerTransfer(
  transactionID,
  localChainID,
  makerInfo,
  from,
  to,
  amount,
  timeStampStr, //only for second,not for millisecond
  nonce,
  ownerAddress = ''
) {
  if (!isCurrentTransaction(transactionID)) {
    return
  }
  if (localChainID === 3 || localChainID === 33) {
    return ScanZKMakerTransfer(
      transactionID,
      localChainID,
      makerInfo,
      from,
      to,
      amount,
      timeStampStr
    )
  }
  if (localChainID === 12 || localChainID === 512) {
    return ScanZKSpaceMakerTransfer(
      transactionID,
      localChainID,
      makerInfo,
      from,
      to,
      amount
      // timeStampStr
    )
  }
  const web3 = localWeb3(localChainID)
  var tokenAddress =
    makerInfo.c1ID === localChainID ? makerInfo.t1Address : makerInfo.t2Address
  ScanMakerTransfer(
    transactionID,
    localChainID,
    makerInfo,
    web3,
    tokenAddress,
    from,
    to,
    amount,
    nonce,
    timeStampStr,
    ownerAddress
  )
}

function ScanMakerTransfer(
  transactionID,
  localChainID,
  makerInfo,
  web3,
  tokenAddress,
  from,
  to,
  amount,
  nonce,
  timeStampStr,
  ownerAddress = ''
) {
  const duration = 10 * 1000
  const ticker = async () => {
    if (!isCurrentTransaction(transactionID)) {
      return
    }
    // checkData
    const checkData = (_from, _to, _amount, _address) => {
      if (localChainID == 4 || localChainID == 44) {
        tokenAddress = getStarkNetValidAddress(tokenAddress)
        _address = getStarkNetValidAddress(tokenAddress)
      }
      if (_address && _address.toLowerCase() !== tokenAddress.toLowerCase()) {
        return false
      }

      if (
        _from.toLowerCase() === from.toLowerCase() &&
        _to.toLowerCase() === to.toLowerCase() &&
        _amount == amount
      ) {
        if (!isCurrentTransaction(transactionID)) {
          return false
        }
        return true
      }
      return false
    }

    // starknet
    if (localChainID == 4 || localChainID == 44) {
      const asyncStarknet = async () => {
        //todo
        const toStarknetAddress = web3State.starkNet.starkNetAddress

        let fromStarknetAddress = getStarkMakerAddress(
          makerInfo.makerAddress,
          localChainID
        )

        let api = config.starknet.Mainnet
        if (localChainID == 44) {
          api = config.starknet.Rinkeby
        }
        const skl = factoryStarknetListen(
          { endPoint: api },
          fromStarknetAddress,
          localChainID
        )
        skl.start()
        skl.transfer(
          { from: fromStarknetAddress, to: toStarknetAddress, amount: amount },
          {
            onReceived: async (transaction) => {
              if (
                checkData(
                  from,
                  to,
                  transaction.value,
                  transaction.contractAddress
                )
              ) {
                store.commit(
                  'updateProceedingMakerTransferTxid',
                  transaction.hash
                )
                storeUpdateProceedState(4)
              }
            },
            onConfirmation: async (transaction) => {
              if (
                checkData(
                  from,
                  to,
                  transaction.value,
                  transaction.contractAddress
                )
              ) {
                storeUpdateProceedState(5)
              }
            },
          }
        )
      }
      asyncStarknet()
      return
    }

    // immutablex
    if (localChainID == 8 || localChainID == 88) {
      const imxListen = new IMXListen(localChainID, to, false)
      imxListen.transfer(
        { from, to },
        {
          onReceived: async (transaction) => {
            if (checkData(from, to, transaction.value, '')) {
              store.commit(
                'updateProceedingMakerTransferTxid',
                transaction.hash
              )
              storeUpdateProceedState(4)
            }
          },
          onConfirmation: async (transaction) => {
            if (checkData(from, to, transaction.value, '')) {
              storeUpdateProceedState(5)
              imxListen.destroy()
            }
          },
        }
      )
      return
    }

    // loopring
    if (localChainID == 9 || localChainID == 99) {
      const lpTokenInfos =
        localChainID === 9
          ? store.state.lpTokenList.mainnet
          : store.state.lpTokenList.rinkeby
      const tokenInfo = lpTokenInfos.find(
        (item) => item.address == tokenAddress
      )
      let accountResult = await loopring.accountInfo(
        makerInfo.makerAddress,
        localChainID
      )
      let accountInfo
      if (!accountResult || accountResult.code) {
        setTimeout(() => ticker(), duration)
        return
      } else {
        accountInfo = accountResult.accountInfo
      }
      let startTime = new Date(
        store.state.proceeding.userTransfer.timeStamp
      ).getTime()
      const userApi = loopring.getUserAPI(localChainID)
      const pValue = nonce
      const rValue = orbiterCore.getRAmountFromTAmount(localChainID, amount)
      let memo, rAmount
      if (rValue.state) {
        memo = pValue.toString()
        rAmount = rValue.rAmount
      } else {
        return
      }
      const GetUserTransferListRequest = {
        accountId: accountInfo.accountId,
        start: startTime,
        end: 99999999999999,
        status: 'processed,processing,received',
        limit: 50,
        tokenSymbol: tokenInfo ? tokenInfo.symbol : 'ETH',
        transferTypes: 'transfer',
      }
      const LPTransferResult = await userApi.getUserTransferList(
        GetUserTransferListRequest,
        localChainID == 9
          ? process.env.VUE_APP_LP_MK_KEY
          : process.env.VUE_APP_LP_MKTEST_KEY
      )
      if (
        LPTransferResult.totalNum !== 0 &&
        LPTransferResult.userTransfers?.length !== 0
      ) {
        let transacionts = LPTransferResult.userTransfers
        for (let index = 0; index < transacionts.length; index++) {
          const lpTransaction = transacionts[index]

          if (
            lpTransaction.txType == 'TRANSFER' &&
            lpTransaction.senderAddress.toLowerCase() ==
              makerInfo.makerAddress.toLowerCase() &&
            lpTransaction.receiverAddress.toLowerCase() ==
              store.state.proceeding.userTransfer.from.toLowerCase() &&
            lpTransaction.symbol == tokenInfo.symbol &&
            lpTransaction.amount == rAmount &&
            lpTransaction.memo == memo
          ) {
            let hash = lpTransaction.hash
            store.commit('updateProceedingMakerTransferTxid', hash)
            if (lpTransaction.status == 'processing') {
              storeUpdateProceedState(4)
              setTimeout(() => ticker(), duration)
              return
            }
            if (
              lpTransaction.status == 'processed' ||
              lpTransaction.status == 'received'
            ) {
              storeUpdateProceedState(5)
              return
            }
          }
        }
      }
      setTimeout(() => ticker(), duration)
      return
    }

    // dydx
    if (localChainID == 11 || localChainID == 511) {
      const dydxWeb3 = new Web3(
        compatibleGlobalWalletConf.value.walletPayload.provider
      )
      const dydxListen = new DydxListen(
        localChainID,
        dydxWeb3,
        ownerAddress,
        false
      )
      dydxListen.transfer(
        { to: ownerAddress },
        {
          onReceived: async (transaction) => {
            if (checkData(from, to, transaction.value, '')) {
              store.commit(
                'updateProceedingMakerTransferTxid',
                transaction.hash
              )
              storeUpdateProceedState(4)
            }
          },
          onConfirmation: async (transaction) => {
            if (checkData(from, to, transaction.value, '')) {
              storeUpdateProceedState(5)
              dydxListen.destroy()
            }
          },
        }
      )
      return
    }

    // ar nova
    if (localChainID == 16 || localChainID == 516) {
      new ArNovaListen(
        localChainID,
        config.arbitrum_nova,
        to,
        async () => startBlockNumber
      )
        .setTransferBreaker(() => isCurrentTransaction(transactionID))
        .transfer(
          { from, to },
          {
            onReceived: (transaction) => {
              if (
                checkData(
                  transaction.from,
                  transaction.to,
                  transaction.value,
                  ''
                )
              ) {
                store.commit(
                  'updateProceedingMakerTransferTxid',
                  transaction.hash
                )
                storeUpdateProceedState(4)
              }
            },
            onConfirmation: (transaction) => {
              if (
                checkData(
                  transaction.from,
                  transaction.to,
                  transaction.value,
                  ''
                )
              ) {
                storeUpdateProceedState(5)
              }
            },
          },
          1
        )
    }

    // when is eth tokenAddress
    if (util.isEthTokenAddress(tokenAddress)) {
      let api = null
      switch (localChainID) {
        case 1:
          api = {
            endPoint: config.etherscan.Mainnet,
            key: config.etherscan.Mainnet.key,
          }
          break
        case 5:
          api = {
            endPoint: config.etherscan.TestNet,
            key: config.etherscan.key,
          }
          break
        case 2:
          api = { endPoint: config.arbitrum.Mainnet, key: '' }
          break
        case 22:
          api = { endPoint: config.arbitrum.Rinkeby, key: '' }
          break
        case 7:
          api = {
            endPoint: config.optimistic.Mainnet,
            key: config.optimistic.key,
          }
          break
        case 77:
          api = {
            endPoint: config.optimistic.Rinkeby,
            key: config.optimistic.key,
          }
          break
        case 15:
          api = {
            endPoint: config.bsc.Mainnet,
            key: config.etherscan.Mainnet.key,
          }
          break
        case 515:
          api = {
            endPoint: config.bsc.Rinkeby,
            key: config.etherscan.Rinkeby.key,
          }
          break
          case 13:
            api = {
              endPoint: config.boba.mainnet,
              key: config.boba.mainnet.key,
            }
            break
          case 513:
            api = {
              endPoint: config.boba.Rinkeby,
              key: config.boba.Rinkeby.key,
            }
            break
      }
      if (!api) {
        return
      }

      new EthListen(api, to, async () => startBlockNumber)
        .setTransferBreaker(() => isCurrentTransaction(transactionID))
        .transfer(
          { from, to },
          {
            onReceived: (transaction) => {
              if (
                checkData(
                  transaction.from,
                  transaction.to,
                  transaction.value,
                  ''
                )
              ) {
                store.commit(
                  'updateProceedingMakerTransferTxid',
                  transaction.hash
                )
                storeUpdateProceedState(4)
              }
            },
            onConfirmation: (transaction) => {
              if (
                checkData(
                  transaction.from,
                  transaction.to,
                  transaction.value,
                  ''
                )
              ) {
                storeUpdateProceedState(5)
              }
            },
          },
          1
        )
      return
    }
    const currentBlock = await web3.eth.getBlockNumber()
    const tokenContract = new web3.eth.Contract(Coin_ABI, tokenAddress)
    // Generate filter options
    const options = {
      filter: {
        from: from,
        to: to,
      },
      fromBlock: currentBlock - 80,
      toBlock: 'latest',
    }
    tokenContract.getPastEvents(
      'Transfer',
      options,
      async function (error, events) {
        if (!isCurrentTransaction(transactionID)) {
          return
        }
        if (error) {
          console.warn('tokenContract getPastEvents-Transfer Error =', error)
        } else {
          for (let index = events.length - 1; index >= 0; index--) {
            const txinfo = events[index]
            if (
              checkData(
                txinfo.returnValues.from,
                txinfo.returnValues.to,
                txinfo.returnValues.amount,
                txinfo.address
              )
            ) {
              let txTimeStamp = await getTimeStampInfo(
                localChainID,
                txinfo.transactionHash,
                txinfo.blockNumber
              )
              if (!txTimeStamp || (txTimeStamp && timeStampStr < txTimeStamp)) {
                store.commit(
                  'updateProceedingMakerTransferTxid',
                  txinfo.transactionHash
                )
                storeUpdateProceedState(4)
                confirmMakerTransaction(
                  transactionID,
                  localChainID,
                  makerInfo,
                  txinfo.transactionHash
                )
                return
              }
            }
          }
        }

        setTimeout(() => ticker(), duration)
      }
    )
  }
  ticker()
  // setTimeout(() => ticker(), 100)
}

async function confirmMakerTransaction(
  transactionID,
  localChainID,
  makerInfo,
  txHash,
  confirmations = 1
) {
  // state: 0 / 1      userTransfer / makerTransfer
  setTimeout(async () => {
    if (!isCurrentTransaction(transactionID)) {
      return
    }
    const trxConfirmations = await getConfirmations(localChainID, txHash)
    if (!trxConfirmations) {
      return confirmMakerTransaction(
        transactionID,
        localChainID,
        makerInfo,
        txHash,
        confirmations
      )
    }
    if (trxConfirmations.confirmations >= confirmations) {
      if (!isCurrentTransaction(transactionID)) {
        return
      }
      storeUpdateProceedState(5)
      return
    }
    return confirmMakerTransaction(
      transactionID,
      localChainID,
      makerInfo,
      txHash,
      confirmations
    )
  }, 10 * 1000)
}

async function getConfirmations(localChainID, txHash) {
  try {
    const web3 = localWeb3(localChainID)
    const trx = await web3.eth.getTransaction(txHash)
    const currentBlock = await web3.eth.getBlockNumber()
    if (!trx) {
      return trx
    }
    if (trx.blockNumber !== null) {
      var blockInfo = await web3.eth.getBlock(trx.blockNumber)
      return {
        confirmations: currentBlock - trx.blockNumber,
        trx: trx,
        timestamp: blockInfo.timestamp,
      }
    }
    return { confirmations: 1, trx: trx, timestamp: 0 }
  } catch (error) {
    console.warn(error)
  }
}

/*
  Whether the monitoring is the current transaction
  return bool
*/

function isCurrentTransaction(txid) {
  let currentTransaction = store.state.proceedTXID
  if (currentTransaction === txid) {
    return true
  }
  return false
}

export default {
  UserTransferReady(user, maker, amount, localChainID, makerInfo, txHash) {
    if (localChainID == 12 || localChainID == 512) {
      txHash = txHash.replace('sync-tx:', '0x')
    }
    store.commit('updateProceedTxID', txHash)
    store.commit('updateProceedingUserTransferFrom', user)
    store.commit('updateProceedingUserTransferTo', maker)
    var realAmount = orbiterCore.getRAmountFromTAmount(localChainID, amount)

    if (realAmount.state) {
      realAmount = realAmount.rAmount
    } else {
      throw new Error(`UserTransferReady error: ${realAmount.error}`)
    }
    store.commit('updateProceedingUserTransferAmount', realAmount)
    confirmUserTransaction(localChainID, makerInfo, txHash)
  },
}

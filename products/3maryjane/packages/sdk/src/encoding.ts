import { encodeAbiParameters, parseAbiParameters } from "viem";
import { EulerAction, HashedAction, KuruAction, PerplAction } from "./actions";
import type { Address, Hex } from "./types";

const actionEnvelope = parseAbiParameters("uint8 kind, bytes payload");
const addressAmount = parseAbiParameters("address token, uint256 amount");
const marketOrder = parseAbiParameters("address market, uint256 size, uint256 minOut, bool fillOrKill");
const limitOrder = parseAbiParameters("address market, uint256 price, uint256 size, bool postOnly");
const cancelOrders = parseAbiParameters("address market, uint40[] orderIds");
const singleAddress = parseAbiParameters("address value");
const singleUint = parseAbiParameters("uint256 value");
const singleBool = parseAbiParameters("bool value");
const hashedAction = parseAbiParameters("uint8 actionType, address asset, uint256 amount");

const perplOrderParams = parseAbiParameters(
  "(uint256 orderDescId,uint256 perpId,uint8 orderType,uint256 orderId,uint256 pricePNS,uint256 lotLNS,uint256 expiryBlock,bool postOnly,bool fillOrKill,bool immediateOrCancel,uint256 maxMatches,uint256 leverageHdths,uint256 lastExecutionBlock,uint256 amountCNS,uint256 maxNegPnlCollatBPS) order",
);
const perplOrdersParams = parseAbiParameters(
  "(uint256 orderDescId,uint256 perpId,uint8 orderType,uint256 orderId,uint256 pricePNS,uint256 lotLNS,uint256 expiryBlock,bool postOnly,bool fillOrKill,bool immediateOrCancel,uint256 maxMatches,uint256 leverageHdths,uint256 lastExecutionBlock,uint256 amountCNS,uint256 maxNegPnlCollatBPS)[] orders, bool revertOnFail",
);
const perplOrderV2Params = parseAbiParameters(
  "(uint256 orderDescId,uint256 perpId,uint8 orderType,uint256 orderId,uint256 pricePNS,uint256 lotLNS,uint256 expiryBlock,bool postOnly,bool fillOrKill,bool immediateOrCancel,uint256 maxMatches,uint256 leverageHdths,uint256 lastExecutionBlock,uint256 amountCNS,uint256 maxNegPnlCollatBPS) order, bytes extension",
);
const perplOrdersV2Params = parseAbiParameters(
  "(uint256 orderDescId,uint256 perpId,uint8 orderType,uint256 orderId,uint256 pricePNS,uint256 lotLNS,uint256 expiryBlock,bool postOnly,bool fillOrKill,bool immediateOrCancel,uint256 maxMatches,uint256 leverageHdths,uint256 lastExecutionBlock,uint256 amountCNS,uint256 maxNegPnlCollatBPS)[] orders, bool revertOnFail, bytes[] extensions",
);

function envelope(kind: number, payload: Hex): Hex {
  return encodeAbiParameters(actionEnvelope, [kind, payload]);
}

function assertUint40Ids(orderIds: readonly number[]): number[] {
  const maxUint40 = 2 ** 40 - 1;
  for (const id of orderIds) {
    if (!Number.isSafeInteger(id) || id < 0 || id > maxUint40) {
      throw new Error(`Kuru order id ${id} is outside uint40`);
    }
  }
  return [...orderIds];
}

export interface PerplOrderDesc {
  orderDescId: bigint;
  perpId: bigint;
  orderType: number;
  orderId: bigint;
  pricePNS: bigint;
  lotLNS: bigint;
  expiryBlock: bigint;
  postOnly: boolean;
  fillOrKill: boolean;
  immediateOrCancel: boolean;
  maxMatches: bigint;
  leverageHdths: bigint;
  lastExecutionBlock: bigint;
  amountCNS: bigint;
  maxNegPnlCollatBPS: bigint;
}

export const encodeKuru = {
  depositMargin(token: Address, amount: bigint): Hex {
    return envelope(KuruAction.DEPOSIT_MARGIN, encodeAbiParameters(addressAmount, [token, amount]));
  },
  withdrawMargin(token: Address, amount: bigint): Hex {
    return envelope(KuruAction.WITHDRAW_MARGIN, encodeAbiParameters(addressAmount, [token, amount]));
  },
  marketBuy(market: Address, quoteSize: bigint, minOut: bigint, fillOrKill = false): Hex {
    return envelope(KuruAction.MARKET_BUY, encodeAbiParameters(marketOrder, [market, quoteSize, minOut, fillOrKill]));
  },
  marketSell(market: Address, size: bigint, minOut: bigint, fillOrKill = false): Hex {
    return envelope(KuruAction.MARKET_SELL, encodeAbiParameters(marketOrder, [market, size, minOut, fillOrKill]));
  },
  limitBuy(market: Address, price: bigint, size: bigint, postOnly = true): Hex {
    return envelope(KuruAction.LIMIT_BUY, encodeAbiParameters(limitOrder, [market, price, size, postOnly]));
  },
  limitSell(market: Address, price: bigint, size: bigint, postOnly = true): Hex {
    return envelope(KuruAction.LIMIT_SELL, encodeAbiParameters(limitOrder, [market, price, size, postOnly]));
  },
  cancelOrders(market: Address, orderIds: readonly number[]): Hex {
    return envelope(KuruAction.CANCEL_ORDERS, encodeAbiParameters(cancelOrders, [market, assertUint40Ids(orderIds)]));
  },
  cancelFlipOrders(market: Address, orderIds: readonly number[]): Hex {
    return envelope(KuruAction.CANCEL_FLIP_ORDERS, encodeAbiParameters(cancelOrders, [market, assertUint40Ids(orderIds)]));
  },
};

export const encodeEuler = {
  enableCollateral(vault: Address): Hex {
    return envelope(EulerAction.ENABLE_COLLATERAL, encodeAbiParameters(singleAddress, [vault]));
  },
  disableCollateral(vault: Address): Hex {
    return envelope(EulerAction.DISABLE_COLLATERAL, encodeAbiParameters(singleAddress, [vault]));
  },
  enableController(vault: Address): Hex {
    return envelope(EulerAction.ENABLE_CONTROLLER, encodeAbiParameters(singleAddress, [vault]));
  },
  disableController(): Hex {
    return envelope(EulerAction.DISABLE_CONTROLLER, "0x");
  },
  supply(vault: Address, amount: bigint): Hex {
    return envelope(EulerAction.SUPPLY, encodeAbiParameters(addressAmount, [vault, amount]));
  },
  withdraw(vault: Address, amount: bigint): Hex {
    return envelope(EulerAction.WITHDRAW, encodeAbiParameters(addressAmount, [vault, amount]));
  },
  borrow(vault: Address, amount: bigint): Hex {
    return envelope(EulerAction.BORROW, encodeAbiParameters(addressAmount, [vault, amount]));
  },
  repay(vault: Address, amount: bigint): Hex {
    return envelope(EulerAction.REPAY, encodeAbiParameters(addressAmount, [vault, amount]));
  },
};

export const encodeHashed = {
  deposit(asset: Address, amount: bigint): Hex {
    return encodeAbiParameters(hashedAction, [HashedAction.DEPOSIT, asset, amount]);
  },
  withdraw(asset: Address, amount: bigint): Hex {
    return encodeAbiParameters(hashedAction, [HashedAction.WITHDRAW, asset, amount]);
  },
  borrow(debtToken: Address, amount: bigint): Hex {
    return encodeAbiParameters(hashedAction, [HashedAction.BORROW, debtToken, amount]);
  },
  repay(debtToken: Address, amount: bigint): Hex {
    return encodeAbiParameters(hashedAction, [HashedAction.REPAY, debtToken, amount]);
  },
};

export const encodePerpl = {
  createAccount(amountCNS: bigint): Hex {
    return envelope(PerplAction.CREATE_ACCOUNT, encodeAbiParameters(singleUint, [amountCNS]));
  },
  depositCollateral(amountCNS: bigint): Hex {
    return envelope(PerplAction.DEPOSIT_COLLATERAL, encodeAbiParameters(singleUint, [amountCNS]));
  },
  withdrawCollateral(amountCNS: bigint): Hex {
    return envelope(PerplAction.WITHDRAW_COLLATERAL, encodeAbiParameters(singleUint, [amountCNS]));
  },
  allowForwarding(allow: boolean): Hex {
    return envelope(PerplAction.ALLOW_FORWARDING, encodeAbiParameters(singleBool, [allow]));
  },
  execOrder(order: PerplOrderDesc): Hex {
    return envelope(PerplAction.EXEC_ORDER, encodeAbiParameters(perplOrderParams, [order]));
  },
  execOrders(orders: readonly PerplOrderDesc[], revertOnFail = true): Hex {
    return envelope(PerplAction.EXEC_ORDERS, encodeAbiParameters(perplOrdersParams, [[...orders], revertOnFail]));
  },
  execOrderV2(order: PerplOrderDesc, extension: Hex): Hex {
    return envelope(PerplAction.EXEC_ORDER_V2, encodeAbiParameters(perplOrderV2Params, [order, extension]));
  },
  execOrdersV2(orders: readonly PerplOrderDesc[], revertOnFail: boolean, extensions: readonly Hex[]): Hex {
    if (orders.length !== extensions.length) throw new Error("Perpl order/extension length mismatch");
    return envelope(
      PerplAction.EXEC_ORDERS_V2,
      encodeAbiParameters(perplOrdersV2Params, [[...orders], revertOnFail, [...extensions]]),
    );
  },
};

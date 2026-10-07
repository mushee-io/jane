/**
 * CL adapters intentionally use `abi.encode(ActionKind, payload)` envelopes.
 * These numeric discriminants are part of the adapter ABI and are exported so
 * viem/ethers clients can encode exactly the same actions.
 */
export const KuruAction = {
  DEPOSIT_MARGIN: 0,
  WITHDRAW_MARGIN: 1,
  MARKET_BUY: 2,
  MARKET_SELL: 3,
  LIMIT_BUY: 4,
  LIMIT_SELL: 5,
  CANCEL_ORDERS: 6,
  CANCEL_FLIP_ORDERS: 7,
} as const;

export const PerplAction = {
  CREATE_ACCOUNT: 0,
  DEPOSIT_COLLATERAL: 1,
  WITHDRAW_COLLATERAL: 2,
  ALLOW_FORWARDING: 3,
  EXEC_ORDER: 4,
  EXEC_ORDERS: 5,
  EXEC_ORDER_V2: 6,
  EXEC_ORDERS_V2: 7,
} as const;

export const EulerAction = {
  ENABLE_COLLATERAL: 0,
  DISABLE_COLLATERAL: 1,
  ENABLE_CONTROLLER: 2,
  DISABLE_CONTROLLER: 3,
  SUPPLY: 4,
  WITHDRAW: 5,
  BORROW: 6,
  REPAY: 7,
} as const;

export const HashedAction = {
  DEPOSIT: 0,
  WITHDRAW: 1,
  BORROW: 2,
  REPAY: 3,
} as const;

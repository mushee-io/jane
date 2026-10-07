import type { Address } from "./types";

export interface KuruDeployment {
  marginAccount: Address;
  router: Address;
  forwarder: Address;
  tokens: Record<string, Address>;
  markets: Record<string, Address>;
}

export interface PerplDeployment {
  exchange: Address;
  collateral: Address;
  restUrl: string;
  websocketUrl: string;
  perpIds: Record<string, number>;
}

export interface EulerDeployment {
  evc: Address;
  eVaultFactory: Address;
  vaultLens?: Address;
  accountLens?: Address;
}

export const kuru = {
  143: {
    marginAccount: "0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5",
    router: "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
    forwarder: "0x974E61BBa9C4704E8Bcc1923fdC3527B41323FAA",
    tokens: {
      WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
      AUSD: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
      USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    },
    markets: {
      "MON-AUSD": "0x131a2e70a5b31a517a74b8c567149bc294470da9",
      "MON-USDC": "0x065C9d28E428A0db40191a54d33d5b7c71a9C394",
    },
  },
  10143: {
    // Current official Kuru testnet contracts. Testnet market addresses are intentionally
    // not hardcoded here because Kuru's public contract-address page does not publish a
    // canonical MON/USDC testnet market. Discover/verify the chosen market at deploy time.
    marginAccount: "0xdDDaBd30785bA8b45e434a1f134BDf304d6125d9",
    router: "0x1f5A250c4A506DA4cE584173c6ed1890B1bf7187",
    forwarder: "0xa21ca7b4e308e9E2dC4C60620572792634EA21a0",
    tokens: {
      USDC: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
      kUSDC: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
      USDT: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D",
      DAK: "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714",
      CHOG: "0xE0590015A873bF326bd645c3E1266d4db41C4E6B",
      YAKI: "0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50",
    },
    markets: {},
  },
} as const satisfies Record<number, KuruDeployment>;

export const perpl = {
  143: {
    exchange: "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F",
    collateral: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    restUrl: "https://app.perpl.xyz/api",
    websocketUrl: "wss://app.perpl.xyz",
    perpIds: { BTC: 1, MON: 10, ETH: 20, SOL: 31, HYPE: 40, ZEC: 50 },
  },
  10143: {
    exchange: "0x1964c32f0be608e7d29302aff5e61268e72080cc",
    collateral: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
    restUrl: "https://testnet.perpl.xyz/api",
    websocketUrl: "wss://testnet.perpl.xyz",
    perpIds: { BTC: 16, ETH: 32, SOL: 48, MON: 64, ZEC: 256 },
  },
} as const satisfies Record<number, PerplDeployment>;

// Euler is currently modeled only where the repository has a verified Monad deployment:
// Monad mainnet (chain 143). Do not infer an Euler testnet deployment from this object.
export const euler = {
  143: {
    evc: "0x7a9324E8f270413fa2E458f5831226d99C7477CD",
    eVaultFactory: "0xba4Dd672062dE8FeeDb665DD4410658864483f1E",
    vaultLens: "0x15d1cc54fb3f7c0498fc991a23d8dc00df3c32a0",
    accountLens: "0x960d481229f70c3c1cbcd3fa2d223f55db9f36ee",
  },
} as const satisfies Record<number, EulerDeployment>;

import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'

// Arbitrum Sepolia base fees fluctuate rapidly; the default 1.2x multiplier
// often produces a maxFeePerGas slightly below baseFee. Use 1.5x to be safe.
const arbitrumSepoliaWithBuffer = {
  ...arbitrumSepolia,
  fees: {
    baseFeeMultiplier: 1.5,
  },
} as const satisfies typeof arbitrumSepolia

// WalletConnect requires a real project ID from https://cloud.walletconnect.com.
// The previous placeholder ('omnicurve-dev') is rejected with a 403, which broke
// wallet connection entirely. Only enable WalletConnect when a genuine ID is set;
// otherwise rely on injected/browser-extension wallets (MetaMask, Brave, Coinbase),
// which require no project ID and work out of the box.
const rawProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
const projectId =
  rawProjectId && rawProjectId !== 'omnicurve-dev' ? rawProjectId : undefined

const walletGroups = [
  {
    groupName: 'Recommended',
    wallets: [
      injectedWallet,
      metaMaskWallet,
      coinbaseWallet,
      // Only offer WalletConnect when a valid project ID is configured.
      ...(projectId ? [walletConnectWallet] : []),
    ],
  },
]

const connectors = connectorsForWallets(walletGroups, {
  appName: 'OmniCurve',
  // connectorsForWallets requires a string; unused when WalletConnect is absent.
  projectId: projectId ?? '',
})

export const wagmiConfig = createConfig({
  connectors,
  chains: [arbitrumSepoliaWithBuffer],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
  ssr: false,
})

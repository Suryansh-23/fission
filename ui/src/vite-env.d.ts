/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_FUSION_API_URL: string
  readonly VITE_FUSION_AUTH_KEY: string
  readonly VITE_FUSION_SOURCE: string
  readonly VITE_SUI_RPC_URL: string
  readonly VITE_SUI_PACKAGE_ID: string
  readonly VITE_LOP_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import { ConnectButton, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SealEncryption } from './components/SealEncryption';

const queryClient = new QueryClient();
const networks = {
  testnet: { url: getFullnodeUrl('testnet') }
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider>
          <div className="min-h-screen flex flex-col items-center justify-start bg-transparent">
            <div className="w-full flex justify-center pt-8 pb-6 sm:pb-10">
              <div className="cyber-border-anim px-4 py-2" style={{maxWidth: 340}}>
                <ConnectButton className="w-full text-lg" />
              </div>
            </div>
            <div className="w-full flex justify-center px-2">
              <SealEncryption />
            </div>
          </div>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default App;

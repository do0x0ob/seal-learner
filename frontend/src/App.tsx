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
          <div className="container mx-auto p-4">
            <div className="flex justify-end mb-4">
              <ConnectButton />
      </div>
            <SealEncryption />
      </div>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default App;

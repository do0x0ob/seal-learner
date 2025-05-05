import { SealClient, getAllowlistedKeyServers, SessionKey } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';


const PACKAGEID = "0x990204fcdc764105d34617aef23e59b86eacd47b9e63c1191467650197a0268a";
const suiAddress = "0x006d980cadd43c778e628201b45cfd3ba6e1047c65f67648a88f635108ffd6eb";

async function main() {
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // 生成一個新的密鑰對
    const keypair = new Ed25519Keypair();

    // 創建 Seal 實例
    const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers("testnet"),
        verifyKeyServers: false,
    });

    // 要加密的消息
    const raw_message = new TextEncoder().encode("Hello, Seal!");

    // 加密消息
    const { encryptedObject: encryptedBytes, key: backupKey } = await client.encrypt({
        threshold: 1,
        packageId: PACKAGEID,
        id: Buffer.from("test-message").toString('hex'),
        data: raw_message,
    });
    console.log('加密後的消息:', encryptedBytes);
    console.log('備份密鑰:', backupKey);

    // 獲取 session key
    const sessionKey = new SessionKey({
        address: suiAddress,
        packageId: PACKAGEID,
        ttlMin: 10, // TTL of 10 minutes
    });
    const sign_message = sessionKey.getPersonalMessage();
    const { signature } = await keypair.signPersonalMessage(sign_message);
    sessionKey.setPersonalMessageSignature(signature);

    // 創建交易
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGEID}::demo::seal_approve`,
        arguments: [
            tx.pure.vector("u8", new TextEncoder().encode("test-message")),
            tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
            tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
        ]
    });

    const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    const decryptedBytes = await client.decrypt({
        data: encryptedBytes,
        sessionKey,
        txBytes,
    });
    console.log('解密後的消息:', new TextDecoder().decode(decryptedBytes));
}

main().catch(console.error); 
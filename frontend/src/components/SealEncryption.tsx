import { useCurrentWallet, useSignPersonalMessage } from '@mysten/dapp-kit';
import { SealClient, getAllowlistedKeyServers, SessionKey, EncryptedObject } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { useState, useMemo, useEffect } from 'react';

const PACKAGEID = "0x990204fcdc764105d34617aef23e59b86eacd47b9e63c1191467650197a0268a";

function toHex(str: string): string {
    return Array.from(new TextEncoder().encode(str))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function SealEncryption() {
    const { currentWallet } = useCurrentWallet();
    const { mutate: signPersonalMessage } = useSignPersonalMessage();
    const [message, setMessage] = useState('');
    const [encryptedData, setEncryptedData] = useState<Uint8Array | null>(null);
    const [backupKey, setBackupKey] = useState<Uint8Array | null>(null);
    const [decryptedMessage, setDecryptedMessage] = useState('');

    // 只初始化一次 SuiClient
    const suiClient = useMemo(() => new SuiClient({ url: getFullnodeUrl('testnet') }), []);
    // 只初始化一次 SealClient
    const keyServerIds = useMemo(() => getAllowlistedKeyServers('testnet'), []);
    const sealClient = useMemo(() => new SealClient({
        suiClient,
        serverObjectIds: keyServerIds,
        verifyKeyServers: false,
    }), [suiClient, keyServerIds]);

    // 只在組件初始化時印一次
    useMemo(() => {
        console.log('keyServerIds', keyServerIds);
    }, [keyServerIds]);

    const handleEncrypt = async () => {
        if (!currentWallet) {
            console.error('請先連接錢包');
            return;
        }

        try {
            // 加密消息
            const raw_message = new TextEncoder().encode(message);
            const idForEncrypt = toHex("test-message1");
            console.log('加密用 id:', idForEncrypt);
            const { encryptedObject, key } = await sealClient.encrypt({
                threshold: 1,
                packageId: PACKAGEID,
                id: idForEncrypt,
                data: raw_message,
            });

            setEncryptedData(encryptedObject);
            setBackupKey(key);
        } catch (error) {
            console.error('加密錯誤:', error);
        }
    };

    const handleDecrypt = async () => {
        if (!encryptedData || !currentWallet || !currentWallet.accounts[0]) {
            console.error('沒有加密數據或未連接錢包');
            return;
        }

        try {
            console.log('1. 準備建立 SessionKey');
            const sessionKey = new SessionKey({
                address: currentWallet.accounts[0].address,
                packageId: PACKAGEID,
                ttlMin: 10,
            });

            console.log('2. 取得需要簽名的訊息');
            const messageToSign = sessionKey.getPersonalMessage();
            
            console.log('3. 呼叫 signPersonalMessage');
            const signature = await new Promise<string>((resolve, reject) => {
                signPersonalMessage(
                    { message: messageToSign },
                    {
                        onSuccess: (result) => {
                            console.log('3.1 簽名成功', result);
                            resolve(result.signature);
                        },
                        onError: (error) => {
                            console.error('3.2 簽名失敗', error);
                            reject(error);
                        },
                    }
                );
            });

            console.log('4. 設定 SessionKey 簽名');
            sessionKey.setPersonalMessageSignature(signature);

            console.log('5. 建立交易');
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGEID}::demo::seal_approve`,
                arguments: [
                    tx.pure.vector("u8", new TextEncoder().encode("test-message1")),
                    tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                    tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                ]
            });

            console.log('6. 構建交易 bytes');
            const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

            console.log('7. 先 fetchKeys');
            const encryptedList = [encryptedData];
            const batchSize = 10;
            for (let i = 0; i < encryptedList.length; i += batchSize) {
                const batch = encryptedList.slice(i, i + batchSize);
                const ids = batch.map((enc) => EncryptedObject.parse(enc).id);
                console.log('解密用 ids:', ids);
                const tx = new Transaction();
                ids.forEach((id) => {
                    tx.moveCall({
                        target: `${PACKAGEID}::demo::seal_approve`,
                        arguments: [
                            tx.pure.vector("u8", new TextEncoder().encode("test-message")),
                            tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                            tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                        ]
                    });
                });
                const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
                try {
                    await sealClient.fetchKeys({ ids, txBytes, sessionKey, threshold: 1 });
                    console.log('fetchKeys 成功', ids);
                } catch (err) {
                    console.log('fetchKeys 失敗', err);
                    // 你可以加 setError 或 return
                }
            }

            console.log('8. 開始解密');
            const decryptedBytes = await sealClient.decrypt({
                data: encryptedData,
                sessionKey,
                txBytes,
            });

            console.log('9. 解密成功');
            setDecryptedMessage(new TextDecoder().decode(decryptedBytes));
        } catch (error) {
            console.error('解密錯誤:', error);
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Seal 加密示例</h1>
            
            <div className="mb-4">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="輸入要加密的消息"
                    className="border p-2 rounded w-full"
                />
            </div>

            <div className="space-y-4">
                <button
                    onClick={handleEncrypt}
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                    disabled={!currentWallet}
                >
                    加密
                </button>

                {encryptedData && (
                    <div>
                        <p className="font-semibold">加密數據:</p>
                        <pre className="bg-gray-100 p-2 rounded overflow-auto">
                            {Array.from(encryptedData).join(', ')}
                        </pre>
                    </div>
                )}

                {backupKey && (
                    <div>
                        <p className="font-semibold">備份密鑰:</p>
                        <pre className="bg-gray-100 p-2 rounded overflow-auto">
                            {Array.from(backupKey).join(', ')}
                        </pre>
                    </div>
                )}

                {encryptedData && (
                    <button
                        onClick={handleDecrypt}
                        className="bg-green-500 text-white px-4 py-2 rounded"
                        disabled={!currentWallet}
                    >
                        解密
                    </button>
                )}

                {decryptedMessage && (
                    <div>
                        <p className="font-semibold">解密後的消息:</p>
                        <pre className="bg-gray-100 p-2 rounded">
                            {decryptedMessage}
                        </pre>
                    </div>
                )}
            </div>

            {backupKey && encryptedData && <BackupKeyDecryptTest backupKey={backupKey} encryptedData={encryptedData} />}
        </div>
    );
}

export function BackupKeyDecryptTest({ backupKey, encryptedData }: { backupKey: Uint8Array | null, encryptedData: Uint8Array | null }) {
    const [decrypted, setDecrypted] = useState<string>('');
    const [hexData, setHexData] = useState<{backupKey: string, encryptedData: string} | null>(null);
    const [cliResult, setCliResult] = useState<string>('');

    // 添加處理 hex 結果的函數
    const handleHexResult = (hex: string) => {
        try {
            // 將 hex 字符串轉換為 Uint8Array
            const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
            // 使用 TextDecoder 轉換為字符串
            const text = new TextDecoder().decode(bytes);
            setCliResult(text);
        } catch (e) {
            setCliResult(`轉換失敗: ${e}`);
        }
    };

    useEffect(() => {
        if (!backupKey || !encryptedData) return;
        
        // 轉換成 hex 格式
        const backupKeyHex = Array.from(backupKey)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const encryptedDataHex = Array.from(encryptedData)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        setHexData({
            backupKey: backupKeyHex,
            encryptedData: encryptedDataHex
        });
    }, [backupKey, encryptedData]);

    return (
        <div className="mt-4 p-2 border rounded bg-yellow-50">
            <div className="font-semibold">備份密鑰直接解密測試：</div>
            {hexData && (
                <div className="mt-2">
                    <div className="mb-2">
                        <p className="font-semibold">CLI 解密指令：</p>
                        <pre className="bg-gray-100 p-2 rounded overflow-auto">
                            seal-cli symmetric-decrypt --key {hexData.backupKey} {hexData.encryptedData}
                        </pre>
                    </div>
                    <div className="mb-2">
                        <p className="font-semibold">備份密鑰 (hex)：</p>
                        <pre className="bg-gray-100 p-2 rounded overflow-auto">
                            {hexData.backupKey}
                        </pre>
                    </div>
                    <div className="mb-2">
                        <p className="font-semibold">加密數據 (hex)：</p>
                        <pre className="bg-gray-100 p-2 rounded overflow-auto">
                            {hexData.encryptedData}
                        </pre>
                    </div>
                    <div className="mb-2">
                        <p className="font-semibold">CLI 解密結果轉換：</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="貼上 CLI 的 hex 結果"
                                className="border p-2 rounded flex-grow"
                                onChange={(e) => handleHexResult(e.target.value)}
                            />
                        </div>
                        {cliResult && (
                            <div className="mt-2">
                                <p className="font-semibold">轉換後的明文：</p>
                                <pre className="bg-gray-100 p-2 rounded">
                                    {cliResult}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className="break-all">{decrypted}</div>
        </div>
    );
} 
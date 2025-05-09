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
    const [encryptedKeysHex] = useState<string[]>([]);

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
            const idForEncrypt = toHex("coolidid");
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
                            console.log('簽名成功', result);
                            resolve(result.signature);
                        },
                        onError: (error) => {
                            console.error('簽名失敗', error);
                            reject(error);
                        },
                    }
                );
            });
            console.log('取得的 signature:', signature);

            console.log('4. 設定 SessionKey 簽名');
            sessionKey.setPersonalMessageSignature(signature);

            console.log('5. 建立交易');
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGEID}::demo::seal_approve`,
                arguments: [
                    tx.pure.vector("u8", new TextEncoder().encode("coolidid")),
                    tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                    tx.object("0x33a9173447926605fdc43b01f6fb49e5818fca4c5b4e977d976821967dee1fce"),
                ]
            });
            const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

            console.log('6. 先 fetchKeys');
            const encryptedList = [encryptedData];
            const batchSize = 10;
            for (let i = 0; i < encryptedList.length; i += batchSize) {
                const batch = encryptedList.slice(i, i + batchSize);
                const ids = batch.map((enc) => EncryptedObject.parse(enc).id);
                console.log('解密用 ids (raw):', ids);
                ids.forEach((id, idx) => {
                    if (Array.isArray(id)) {
                        const hex = id.map((b) => b.toString(16).padStart(2, '0')).join('');
                        console.log(`解密用 ids[${idx}] (hex):`, hex);
                    } else if (typeof id === 'string') {
                        console.log(`解密用 ids[${idx}] (string):`, id);
                    } else {
                        console.log(`解密用 ids[${idx}] (unknown type):`, id);
                    }
                });
                await sealClient.fetchKeys({ ids, txBytes, sessionKey, threshold: 1 });
                console.log('fetchKeys 成功', ids);
                
                // 從 window 變數中取得 fetchKeys 的結果（假設你在 fetchKeys 的 server 實作有將結果掛到 window）
                // 這裡直接用 any 取用 window 變數
                const fetchKeysResult: any = (window as any).lastSealFetchKeysResult;
                const decryptionKeyObj = fetchKeysResult?.decryption_keys?.[0];
                if (decryptionKeyObj) {
                    const idArr = decryptionKeyObj.id;
                    if (Array.isArray(idArr)) {
                        const idHex = idArr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
                        // 嘗試將 id 轉成 UTF-8 字串
                        let idText = '';
                        try {
                            idText = new TextDecoder().decode(new Uint8Array(idArr));
                        } catch (e) {
                            idText = '[無法轉換為文字]';
                        }
                        console.log('fetchKeys 回傳的 id (hex):', idHex);
                        console.log('fetchKeys 回傳的 id (text):', idText);
                        // 比對 PACKAGEID 是否有部分出現在 idHex
                        const packageIdNo0x = PACKAGEID.replace(/^0x/, '');
                        if (idHex.includes(packageIdNo0x)) {
                            console.log('idHex 包含 PACKAGEID！');
                        } else {
                            console.log('idHex 不包含 PACKAGEID。');
                        }
                    } else {
                        console.log('fetchKeys 回傳的 id (raw):', decryptionKeyObj.id);
                    }
                    console.log('你用的 PACKAGEID:', PACKAGEID);
                }
            }

            console.log('8. 開始解密');
            let decryptedBytes = null;
            try {
                decryptedBytes = await sealClient.decrypt({
                    data: encryptedData,
                    sessionKey,
                    txBytes,
                });
                console.log('9. 解密成功');
                setDecryptedMessage(new TextDecoder().decode(decryptedBytes));
            } catch (error) {
                console.error('解密錯誤:', error);
            }
            // 無論解密成功與否都執行 fetchKeysResult id 格式比對
            const fetchKeysResult: any = (window as any).lastSealFetchKeysResult;
            console.log('fetchKeysResult:', fetchKeysResult);
            const decryptionKeyObj = fetchKeysResult?.decryption_keys?.[0];
            console.log('decryptionKeyObj:', decryptionKeyObj);
            if (decryptionKeyObj) {
                const idArr = decryptionKeyObj.id;
                if (Array.isArray(idArr)) {
                    const idHex = idArr.map((b: number) => b.toString(16).padStart(2, '0')).join('');
                    let idText = '';
                    try {
                        idText = new TextDecoder().decode(new Uint8Array(idArr));
                    } catch (e) {
                        idText = '[無法轉換為文字]';
                    }
                    console.log('fetchKeys 回傳的 id (hex):', idHex);
                    console.log('fetchKeys 回傳的 id (text):', idText);
                    const packageIdNo0x = PACKAGEID.replace(/^0x/, '');
                    if (idHex.includes(packageIdNo0x)) {
                        console.log('idHex 包含 PACKAGEID！');
                    } else {
                        console.log('idHex 不包含 PACKAGEID。');
                    }
                } else {
                    console.log('fetchKeys 回傳的 id (raw):', decryptionKeyObj.id);
                }
                console.log('你用的 PACKAGEID:', PACKAGEID);
            }
        } catch (error) {
            console.error('解密流程異常:', error);
        }
    };

    return (
        <div className="flex flex-col items-center min-h-screen justify-center">
            <div className="cyber-border-anim">
                <div className="cyber-panel">
                    <h1 className="text-4xl font-bold mb-8 text-center cyber-glow">Seal 加密示例</h1>
                    <div className="space-y-8">
                        {/* 輸入區域 */}
                        <div>
                            <label className="block text-base font-bold text-cyan-300 mb-2 cyber-glow">
                                輸入要加密的消息
                            </label>
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="請輸入要加密的消息"
                                className="w-full"
                            />
                        </div>

                        {/* 按鈕區域 */}
                        <div className="flex gap-6 justify-center">
                            <button
                                onClick={handleEncrypt}
                                disabled={!currentWallet || !message}
                            >
                                加密
                            </button>
                            {encryptedData && (
                                <button
                                    onClick={handleDecrypt}
                                    disabled={!currentWallet}
                                >
                                    解密
                                </button>
                            )}
                        </div>

                        {/* 加密結果區域 */}
                        {encryptedData && (
                            <div>
                                <h2 className="text-xl font-bold mb-2 cyber-glow">加密結果</h2>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-sm font-bold text-cyan-400 mb-1">加密數據:</p>
                                        <pre className="overflow-x-auto break-all">{Array.from(encryptedData).join(', ')}</pre>
                                    </div>
                                    {backupKey && (
                                        <div>
                                            <p className="text-sm font-bold text-cyan-400 mb-1">備份密鑰:</p>
                                            <pre className="overflow-x-auto break-all">{Array.from(backupKey).join(', ')}</pre>
                                        </div>
                                    )}
                                    {encryptedKeysHex.length > 0 && (
                                        <div>
                                            <p className="text-sm font-bold text-cyan-400 mb-1">Encrypted Keys (HEX):</p>
                                            {encryptedKeysHex.map((hex, index) => (
                                                <pre key={index} className="overflow-x-auto break-all mb-2">
                                                    Key {index + 1}: {hex}
                                                </pre>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 解密結果區域 */}
                        {decryptedMessage && (
                            <div>
                                <h2 className="text-xl font-bold mb-2 text-green-400 cyber-glow">解密結果</h2>
                                <div className="bg-black/60 p-4 rounded-lg border border-green-400">
                                    <p className="text-lg text-green-200 font-mono break-words">{decryptedMessage}</p>
                                </div>
                            </div>
                        )}

                        {/* 錯誤提示 */}
                        {!currentWallet && (
                            <div className="bg-black/60 p-4 rounded-lg border border-yellow-400">
                                <p className="text-yellow-300 font-bold">請先連接錢包以使用加密/解密功能</p>
                            </div>
                        )}
                    </div>

                    {/* 備份密鑰解密測試區域 */}
                    {backupKey && encryptedData && (
                        <div className="mt-10">
                            <BackupKeyDecryptTest backupKey={backupKey} encryptedData={encryptedData} />
                        </div>
                    )}

                    {/* 新增 ByteArrayToStringTool 元件 */}
                    <div className="mt-10">
                        <ByteArrayToStringTool />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function BackupKeyDecryptTest({ backupKey, encryptedData }: { backupKey: Uint8Array | null, encryptedData: Uint8Array | null }) {
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
        <div className="cyber-border-anim mt-8">
            <div className="cyber-panel">
                <h2 className="text-xl font-bold mb-4 text-yellow-300 cyber-glow">備份密鑰解密測試</h2>
                {hexData && (
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm font-bold text-yellow-200 mb-1">CLI 解密指令：</p>
                            <pre className="overflow-x-auto break-all">seal-cli symmetric-decrypt --key {hexData.backupKey} {hexData.encryptedData}</pre>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-yellow-200 mb-1">備份密鑰 (hex)：</p>
                            <pre className="overflow-x-auto break-all">{hexData.backupKey}</pre>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-yellow-200 mb-1">加密數據 (hex)：</p>
                            <pre className="overflow-x-auto break-all">{hexData.encryptedData}</pre>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-yellow-200 mb-1">CLI 解密結果轉換：</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="貼上 CLI 的 hex 結果"
                                    className="flex-grow"
                                    onChange={(e) => handleHexResult(e.target.value)}
                                />
                            </div>
                            {cliResult && (
                                <div className="mt-2">
                                    <p className="text-sm font-bold text-yellow-200 mb-1">轉換後的明文：</p>
                                    <pre className="overflow-x-auto break-all">{cliResult}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// 新增 ByteArrayToStringTool 元件
function ByteArrayToStringTool() {
    const [input, setInput] = useState('');
    const [result, setResult] = useState('');

    function handleConvert() {
        try {
            // 將輸入的字串轉成陣列
            const arr = JSON.parse(input);
            if (!Array.isArray(arr)) throw new Error('格式錯誤，請輸入數字陣列');
            const bytes = new Uint8Array(arr);
            const text = new TextDecoder().decode(bytes);
            setResult(text);
        } catch (e) {
            setResult('轉換失敗: ' + (e as Error).message);
        }
    }

    return (
        <div className="cyber-border-anim mt-8">
            <div className="cyber-panel">
                <h2 className="text-xl font-bold mb-4 text-yellow-300 cyber-glow">字節陣列轉字串工具</h2>
                <textarea
                    className="w-full p-2 mb-2 border border-gray-400 rounded"
                    rows={3}
                    placeholder="請貼上字節陣列，如 [24, 83, 85, ...]"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <button className="mt-2 px-4 py-2 bg-cyan-700 text-white rounded" onClick={handleConvert}>
                    轉換
                </button>
                {result && (
                    <div className="mt-4">
                        <p className="text-sm font-bold text-yellow-200 mb-1">轉換結果：</p>
                        <pre className="overflow-x-auto break-all">{result}</pre>
                    </div>
                )}
            </div>
        </div>
    );
} 
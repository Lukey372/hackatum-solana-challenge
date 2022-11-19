import {clusterApiUrl, Connection, Keypair, PublicKey, Transaction} from '@solana/web3.js';
import {
    createAssociatedTokenAccount,
    createTransferCheckedInstruction,
    getAccount,
    getAssociatedTokenAddress,
    getMint
} from '@solana/spl-token';

const splToken = new PublicKey(process.env.TOKEN_MINT);
const splNFT = new PublicKey(process.env.NFT_MINT);
const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET);

export default function handler(request, response) {
    console.log("---------------------------------------")
    // We set up our handler to only respond to `GET` and `POST` requests.
    if (request.method === 'GET') return get(request, response);
    if (request.method === 'POST') return post(request, response);
    throw new Error(`Unexpected method ${request.method}`);
};

const get = async (request, response) => {
    const label = 'Pizza del SOL';
    const icon = 'https://exiledapes.academy/wp-content/uploads/2021/09/X_share.png';
    response.status(200).send({
        label,
        icon,
    });
};

const post = async (request, response) => {
    // Account provided in the transaction request body by the wallet.
    const accountField = request.body?.account;
    if (!accountField) throw new Error('missing account');

    const sender = new PublicKey(accountField);
    const connection = new Connection(clusterApiUrl('devnet'));

    // create spl transfer instruction
    const splTransferIx = await createSplTransferIx(sender, connection);

    // create the transaction
    const blockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        feePayer: sender,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight
    });

    // add the instruction to the transaction
    transaction.add(splTransferIx);

    // Serialize and return the unsigned transaction.
    const serializedTransaction = transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
    });

    const base64Transaction = serializedTransaction.toString('base64');
    const message = 'Thank you for your purchase of ExiledApe #518';

    response.status(200).send({
        transaction: base64Transaction,
        message,
    });
};

async function createSplTransferIx(sender, connection) {
    console.log("Check if sender has NFT")
    // check if sender has NFT
    const hasNFT = checkNFT(sender, connection);

    console.log("Determine payment method")
    if (hasNFT) {
        console.log("Sender uses NFT")
        return payWithNft(sender, connection);
    } else {
        console.log("Sender uses Token")
        return payWithTokens(sender, connection);
    }
}

async function checkNFT(sender, connection) {
    console.log("Get NFT account info")
    // handle exception that no token account is found
    try {
        const senderNftATA = await getAssociatedTokenAddress(splNFT, sender);
        const senderAccount = await getAccount(connection, senderNftATA);

        console.log("Check if mint is valid")
        const mintNFT = await getMint(connection, splNFT);
        if (!mintNFT.isInitialized) throw new Error('mint not initialized');
        return senderAccount.amount > 0;
    } catch (e){
        return false;
    }
}

async function payWithNft(sender, connection) {
    console.log("Sender: " + sender.toBase58())
    const senderInfo = await connection.getAccountInfo(sender);
    if (!senderInfo) throw new Error('sender not found');

    // Get the sender's ATA and check that the account exists and can send tokens
    const senderNftATA = await getAssociatedTokenAddress(splNFT, sender);
    console.log("Sender NFT ATA: " + senderNftATA)
    const senderNftAccount = await getAccount(connection, senderNftATA);
    if (!senderNftAccount.isInitialized) throw new Error('sender not initialized');
    if (senderNftAccount.isFrozen) throw new Error('sender frozen');

    // Get the merchant's ATA and check that the account exists and can receive tokens
    let merchantNftATA;
    try {
        merchantNftATA = await getAssociatedTokenAddress(splNFT, MERCHANT_WALLET);
    } catch (e){
        console.log("create token account")
        merchantNftATA = await createAssociatedTokenAccount(
            connection, // connection
            MERCHANT_WALLET, // fee payer
            splNFT, // mint
            MERCHANT_WALLET // owner,
        );
    }

    console.log("Merchant NFT ATA: " + merchantNftATA)
    const merchantNftAccount = await getAccount(connection, merchantNftATA);
    if (!merchantNftAccount.isInitialized) throw new Error('merchant not initialized');
    if (merchantNftAccount.isFrozen) throw new Error('merchant frozen');

    // Check that the token provided is an initialized mint
    const mintNft = await getMint(connection, splNFT);
    if (!mintNft.isInitialized) throw new Error('mint not initialized');

    // Check that the sender has enough tokens
    const tokens = 1;  // only one token (NFT)
    console.log("Sender funds: " + senderNftAccount.amount)
    if (tokens > senderNftAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    console.log("Create NFT transaction")
    const splTransferIx = createTransferCheckedInstruction(
        senderNftATA,
        splNFT,
        merchantNftATA,
        sender,
        tokens,
        mintNft.decimals,
    );

    console.log("Create NFT transaction references")
    // Create a reference that is unique to each checkout session
    const references = [new Keypair().publicKey];

    // add references to the instruction
    for (const pubkey of references) {
        splTransferIx.keys.push({pubkey, isWritable: false, isSigner: false});
    }

    console.log("Return transaction")
    return splTransferIx;
}

async function payWithTokens(sender, connection) {
    console.log("Sender: " + sender.toBase58())
    const senderInfo = await connection.getAccountInfo(sender);
    if (!senderInfo) throw new Error('sender not found');

    // Get the sender's ATA and check that the account exists and can send tokens
    const senderATA = await getAssociatedTokenAddress(splToken, sender);
    console.log("Sender ATA: " + senderATA)
    const senderAccount = await getAccount(connection, senderATA);
    if (!senderAccount.isInitialized) throw new Error('sender not initialized');
    if (senderAccount.isFrozen) throw new Error('sender frozen');

    // Get the merchant's ATA and check that the account exists and can receive tokens
    const merchantATA = await getAssociatedTokenAddress(splToken, MERCHANT_WALLET);
    console.log("Merchant ATA: " + merchantATA)
    const merchantAccount = await getAccount(connection, merchantATA);
    if (!merchantAccount.isInitialized) throw new Error('merchant not initialized');
    if (merchantAccount.isFrozen) throw new Error('merchant frozen');

    // Check that the token provided is an initialized mint
    const mint = await getMint(connection, splToken);
    if (!mint.isInitialized) throw new Error('mint not initialized');

    // Check that the sender has enough tokens
    const tokens = 3000000000;  // price
    console.log("Sender funds: " + senderAccount.amount)
    if (tokens > senderAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    console.log("Create Token transaction")
    const splTransferIx = createTransferCheckedInstruction(
        senderATA,
        splToken,
        merchantATA,
        sender,
        tokens,
        mint.decimals,
    );

    // Create a reference that is unique to each checkout session
    console.log("Create token transaction references")
    const references = [new Keypair().publicKey];

    // add references to the instruction
    for (const pubkey of references) {
        splTransferIx.keys.push({pubkey, isWritable: false, isSigner: false});
    }

    console.log("Return token transaction")
    return splTransferIx;
}
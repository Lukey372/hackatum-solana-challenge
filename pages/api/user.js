import {
    clusterApiUrl,
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction
} from '@solana/web3.js';
import {
    createAssociatedTokenAccount,
    createTransferCheckedInstruction,
    getAccount,
    getAssociatedTokenAddress,
    getMint
} from '@solana/spl-token';

const FROM_KEYPAIR = Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.SECRET)));
const splToken = new PublicKey(process.env.TOKEN_MINT);
const splNFT = new PublicKey(process.env.NFT_MINT);
const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET);
let hasNFT;

export default function handler(request, response) {
    console.log("---------------------------------------")
    // We set up our handler to only respond to `GET` and `POST` requests.
    if (request.method === 'GET') return get(request, response);
    if (request.method === 'POST') return post(request, response);
    throw new Error(`Unexpected method ${request.method}`);
};

const get = async (request, response) => {
    const label = 'Pizza del SOL';
    const icon = 'https://i.imgur.com/Qed0oFt.jpeg';
    response.status(200).send({
        label,
        icon,
    });
};

const post = async (request, response) => {
    // Account provided in the transaction request body by the wallet.
    const accountField = request.body?.account;
    if (!accountField) throw new Error('missing account');

    // const pricePizz = request.body?.price;
    // if (!pricePizz) throw new Error('missing price');

    // const useNft = request.body?.nft;
    // if (!useNft) throw new Error('missing use of NFT');

    const customer = new PublicKey(accountField);
    const connection = new Connection(clusterApiUrl('devnet'));

    // create spl transfer instruction
    const splTransferIx = await createSplTokenTransferIx(customer, connection);

    // create the transaction
    const blockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        feePayer: customer,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight
    });

    // add the instruction to the transaction
    transaction.add(splTransferIx);

    if(!hasNFT){
        const splNftTransfer = await createSplNftTransferIx(customer, connection);
        console.log("Sent reward NFT to customer.")
        const transactionNft = new Transaction({
            feePayer: MERCHANT_WALLET,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        });
        transactionNft.add(splNftTransfer);
        console.log("send NFT to user");
        const signature = sendAndConfirmTransaction(connection, transactionNft, [FROM_KEYPAIR]);
        console.log("signature: " + signature);
    }

    // Serialize and return the unsigned transaction.
    const serializedTransaction = transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
    });

    const base64Transaction = serializedTransaction.toString('base64');
    const message = 'Enjoy your Pizza de SOL!';

    response.status(200).send({
        transaction: base64Transaction,
        message,
    });
};

async function createSplTokenTransferIx(customer, connection) {
    console.log("Check if customer has NFT")
    // check if customer has NFT
    hasNFT = await checkNFT(customer, connection);

    console.log("Determine payment method")
    if (hasNFT) {
        console.log("Customer uses NFT")
        return payWithNft(customer, connection);
    } else {
        console.log("Customer uses Token")
        return payWithTokens(customer, connection);
    }
}

async function checkNFT(customer, connection) {
    console.log("Get NFT account info");
    // handle exception that no token account is found
    try {
        const customerNftATA = await getAssociatedTokenAddress(splNFT, customer);
        const customerAccount = await getAccount(connection, customerNftATA);

        console.log("Check if mint is valid")
        const mintNFT = await getMint(connection, splNFT);
        if (!mintNFT.isInitialized) throw new Error('mint not initialized');
        console.log("NFT Funds:" + customerAccount.amount)
        return (customerAccount.amount > 0);
    } catch (e){
        return false;
    }
    return false;
}

async function payWithNft(customer, connection) {
    console.log("Customer: " + customer.toBase58())
    const customerInfo = await connection.getAccountInfo(customer);
    if (!customerInfo) throw new Error('customer not found');

    // Get the customer's ATA and check that the account exists and can send tokens
    const customerNftATA = await getAssociatedTokenAddress(splNFT, customer);
    console.log("Customer NFT ATA: " + customerNftATA)
    const customerNftAccount = await getAccount(connection, customerNftATA);
    if (!customerNftAccount.isInitialized) throw new Error('Customer not initialized');
    if (customerNftAccount.isFrozen) throw new Error('Customer frozen');

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

    // Check that the customer has enough tokens
    const tokens = 1;  // only one token (NFT)
    console.log("Customer NFT funds: " + customerNftAccount.amount)
    if (tokens > customerNftAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    console.log("Create NFT transaction")
    const splTransferIx = createTransferCheckedInstruction(
        customerNftATA,
        splNFT,
        merchantNftATA,
        customer,
        tokens,
        mintNft.decimals,
    );

    console.log("Create NFT transaction references:" + splTransferIx)
    // Create a reference that is unique to each checkout session
    const references = [new Keypair().publicKey];

    // add references to the instruction
    for (const pubkey of references) {
        splTransferIx.keys.push({pubkey, isWritable: false, isSigner: false});
    }

    console.log("Return transaction")
    return splTransferIx;
}

async function payWithTokens(customer, connection) {
    console.log("Customer: " + customer.toBase58())
    const customerInfo = await connection.getAccountInfo(customer);
    if (!customerInfo) throw new Error('customer not found');

    // Get the customer's ATA and check that the account exists and can send tokens
    const customerATA = await getAssociatedTokenAddress(splToken, customer);
    console.log("Customer ATA: " + customerATA)
    const customerAccount = await getAccount(connection, customerATA);
    if (!customerAccount.isInitialized) throw new Error('customer not initialized');
    if (customerAccount.isFrozen) throw new Error('customer frozen');

    // Get the merchant's ATA and check that the account exists and can receive tokens
    const merchantATA = await getAssociatedTokenAddress(splToken, MERCHANT_WALLET);
    console.log("Merchant ATA: " + merchantATA)
    const merchantAccount = await getAccount(connection, merchantATA);
    if (!merchantAccount.isInitialized) throw new Error('merchant not initialized');
    if (merchantAccount.isFrozen) throw new Error('merchant frozen');

    // Check that the token provided is an initialized mint
    const mint = await getMint(connection, splToken);
    if (!mint.isInitialized) throw new Error('mint not initialized');

    // Check that the customer has enough tokens
    const tokens =  1000000000;  // price
    console.log("Customer funds: " + customerAccount.amount)
    if (tokens > customerAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    console.log("Create Token transaction")
    const splTransferIx = createTransferCheckedInstruction(
        customerATA,
        splToken,
        merchantATA,
        customer,
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

async function createSplNftTransferIx(customer, connection){
    console.log("Customer: " + customer.toBase58())
    const customerInfo = await connection.getAccountInfo(customer);
    if (!customerInfo) throw new Error('customer not found');

    // Get the customer's ATA and check that the account exists and can send tokens
    const merchantNftATA = await getAssociatedTokenAddress(splNFT, MERCHANT_WALLET);
    console.log("Merchant NFT ATA: " + merchantNftATA)
    const merchantNftAccount = await getAccount(connection, merchantNftATA);
    if (!merchantNftAccount.isInitialized) throw new Error('customer not initialized');
    if (merchantNftAccount.isFrozen) throw new Error('customer frozen');

    // Get the merchant's ATA and check that the account exists and can receive tokens
    let customerNftATA;
    try {
        customerNftATA = await getAssociatedTokenAddress(splNFT, customer);
    } catch (e){
        console.log("create token account")
        customerNftATA = await createAssociatedTokenAccount(
            connection, // connection
            customer, // fee payer
            splNFT, // mint
            customer // owner,
        );
    }

    console.log("Customer NFT ATA: " + customerNftATA)
    const customerNftAccount = await getAccount(connection, customerNftATA);
    if (!customerNftAccount.isInitialized) throw new Error('merchant not initialized');
    if (customerNftAccount.isFrozen) throw new Error('merchant frozen');

    // Check that the token provided is an initialized mint
    const mintNft = await getMint(connection, splNFT);
    if (!mintNft.isInitialized) throw new Error('mint not initialized');

    // Check that the customer has enough tokens
    const tokens = 1;  // only one token (NFT)
    console.log("Merchant NFT funds: " + merchantNftAccount.amount)
    if (tokens > merchantNftAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    console.log("Create NFT transaction")
    const splTransferIx = createTransferCheckedInstruction(
        merchantNftATA,
        splNFT,
        customerNftATA,
        MERCHANT_WALLET,
        tokens,
        mintNft.decimals,
    );

    console.log("Create NFT transaction references:" + splTransferIx)
    // Create a reference that is unique to each checkout session
    const references = [new Keypair().publicKey];

    // add references to the instruction
    for (const pubkey of references) {
        splTransferIx.keys.push({pubkey, isWritable: false, isSigner: false});
    }

    console.log("Return transaction")
    return splTransferIx;
}
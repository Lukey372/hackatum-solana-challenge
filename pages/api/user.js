import { clusterApiUrl, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { createTransferCheckedInstruction, getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { TEN } from '@solana/pay';

const splToken = new PublicKey(process.env.TOKEN_MINT);
const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET);

export default function handler(request, response) {
  // We set up our handler to only respond to `GET` and `POST` requests.
  if (request.method === 'GET') return get(request, response);
  if (request.method === 'POST') return post(request, response);
  throw new Error(`Unexpected method ${request.method}`);
};

const get = async (request, response) => {
  const label = 'Exiled Apes Academy';
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

  // create spl transfer instruction
  const splTransferIx = await createSplTransferIx(sender, connection);

  // create the transaction
  const transaction = new Transaction();

  // add the instruction to the transaction
  transaction.add(splTransferIx);

  // Serialize and return the unsigned transaction.
  const serializedTransaction = transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  });

  const base64Transaction = serializedTransaction.toString('base64');
  const message = 'Thank you for your purchase of ExiledApe #518';

  response.status(200).send({ transaction: base64Transaction, message });
};

async function createSplTransferIx(sender, connection) {
  const senderInfo = await connection.getAccountInfo(sender);
  if (!senderInfo) throw new Error('sender not found');

  // Get the sender's ATA and check that the account exists and can send tokens
  const senderATA = await getAssociatedTokenAddress(splToken, sender);
  const senderAccount = await getAccount(connection, senderATA);
  if (!senderAccount.isInitialized) throw new Error('sender not initialized');
  if (senderAccount.isFrozen) throw new Error('sender frozen');

  // Get the merchant's ATA and check that the account exists and can receive tokens
  const merchantATA = await getAssociatedTokenAddress(splToken, MERCHANT_WALLET);
  const merchantAccount = await getAccount(connection, merchantATA);
  if (!merchantAccount.isInitialized) throw new Error('merchant not initialized');
  if (merchantAccount.isFrozen) throw new Error('merchant frozen');

  // Check that the token provided is an initialized mint
  const mint = await getMint(connection, splToken);
  if (!mint.isInitialized) throw new Error('mint not initialized');

  // You should always calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  let amount = calculateCheckoutAmount();
  amount = amount.times(TEN.pow(mint.decimals)).integerValue(BigNumber.ROUND_FLOOR);

  // Check that the sender has enough tokens
  const tokens = BigInt(String(amount));
  if (tokens > senderAccount.amount) throw new Error('insufficient funds');

  // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
  const splTransferIx = createTransferCheckedInstruction(
    senderATA,
    splToken,
    merchantATA,
    sender,
    tokens,
    mint.decimals,
  );

  // Create a reference that is unique to each checkout session
  const references = [new Keypair().publicKey];

  // add references to the instruction
  for (const pubkey of references) {
    splTransferIx.keys.push({ pubkey, isWritable: false, isSigner: false });
  }

  return splTransferIx;
}

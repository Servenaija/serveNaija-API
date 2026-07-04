// const cron = require('node-cron');
// const Withdrawal = require('../models/withdrawal');
// const Rider = require('../models/rider');
// const Vendor = require('../models/vendor');
// const axios = require('axios');

// const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// // Get bank code from account number using Paystack API
// async function getBankCodeFromAccount(accountNumber, accountName, bankName = '') {
//     try {
//         const headers = {
//             Authorization: `Bearer ${PAYSTACK_SECRET}`,
//         };

//         console.log(`Resolving account ${accountNumber}...`);

//         // Step 1: Get list of all banks from Paystack
//         console.log(' Fetching banks list from Paystack...');
//         const banksResponse = await axios.get("https://api.paystack.co/bank", {
//             headers,
//             params: {
//                 country: 'nigeria',
//                 currency: 'NGN'
//             }
//         });

//         if (!banksResponse.data.data || !banksResponse.data.data.length) {
//             return { success: false, error: 'No banks available from Paystack' };
//         }

//         const banks = banksResponse.data.data;
//         console.log(` Total banks available: ${banks.length}`);

//         // Step 2: Try to find bank by name if provided
//         if (bankName) {
//             const normalizedBankName = bankName.toLowerCase().trim();
            
//             // Search for bank by name (partial match)
//             const foundBank = banks.find(bank => 
//                 bank.name.toLowerCase().includes(normalizedBankName) ||
//                 normalizedBankName.includes(bank.name.toLowerCase())
//             );

//             if (foundBank) {
//                 console.log(` Found bank: ${foundBank.name} (${foundBank.code})`);
                
//                 // Step 3: Verify account with this bank
//                 try {
//                     const verifyResponse = await axios.get(
//                         `https://api.paystack.co/bank/resolve`,
//                         {
//                             headers,
//                             params: {
//                                 account_number: accountNumber,
//                                 bank_code: foundBank.code
//                             },
//                             timeout: 10000
//                         }
//                     );

//                     if (verifyResponse.data.status === true && verifyResponse.data.data) {
//                         console.log(` Account verified: ${verifyResponse.data.data.account_name}`);
//                         return {
//                             success: true,
//                             bankCode: foundBank.code,
//                             bankName: foundBank.name,
//                             accountName: verifyResponse.data.data.account_name
//                         };
//                     }
//                 } catch (verifyError) {
//                     console.log(`⚠️  Account verification failed for ${foundBank.name}: ${verifyError.response?.data?.message || verifyError.message}`);
//                 }
//             } else {
//                 console.log(`⚠️  Bank "${bankName}" not found in Paystack banks list`);
//             }
//         }

//         // Step 4: If bank name not provided or not found, try common banks first
//         console.log(' Trying common banks for account resolution...');
//         const commonBankCodes = ['057', '058', '011', '044', '033', '070', '232']; // Add OPay code if known
        
//         for (const bankCode of commonBankCodes) {
//             try {
//                 const resolveResponse = await axios.get(
//                     `https://api.paystack.co/bank/resolve`,
//                     {
//                         headers,
//                         params: {
//                             account_number: accountNumber,
//                             bank_code: bankCode
//                         },
//                         timeout: 5000 // Shorter timeout for faster iteration
//                     }
//                 );

//                 if (resolveResponse.data.status === true && resolveResponse.data.data) {
//                     const bank = banks.find(b => b.code === bankCode);
//                     console.log(` Account resolved with ${bank?.name || 'Unknown Bank'} (${bankCode}): ${resolveResponse.data.data.account_name}`);
//                     return {
//                         success: true,
//                         bankCode: bankCode,
//                         bankName: bank?.name || 'Unknown',
//                         accountName: resolveResponse.data.data.account_name
//                     };
//                 }
//             } catch (error) {
//                 // Just continue to next bank if this one fails
//                 continue;
//             }
//         }

//         // Step 5: If common banks fail, try all banks (this might be slow)
//         console.log(' Trying all available banks for account resolution...');
//         for (const bank of banks) {
//             try {
//                 const resolveResponse = await axios.get(
//                     `https://api.paystack.co/bank/resolve`,
//                     {
//                         headers,
//                         params: {
//                             account_number: accountNumber,
//                             bank_code: bank.code
//                         },
//                         timeout: 3000
//                     }
//                 );

//                 if (resolveResponse.data.status === true && resolveResponse.data.data) {
//                     console.log(` Account resolved with ${bank.name} (${bank.code}): ${resolveResponse.data.data.account_name}`);
//                     return {
//                         success: true,
//                         bankCode: bank.code,
//                         bankName: bank.name,
//                         accountName: resolveResponse.data.data.account_name
//                     };
//                 }
//             } catch (error) {
//                 // Skip this bank and continue
//                 continue;
//             }
//         }

//         return { 
//             success: false, 
//             error: 'Could not resolve bank code. Account number might be invalid or bank not supported.' 
//         };

//     } catch (error) {
//         console.error(` Error resolving account:`, error.response?.data || error.message);
//         return { 
//             success: false, 
//             error: error.response?.data?.message || error.message 
//         };
//     }
// }

// // Send money for approved withdrawals
// async function sendMoneyForApprovedWithdrawals() {
//     try {
//         console.log(' Cron job: Sending money for approved withdrawals...');


//         // Find withdrawals that are APPROVED (admin approved) but money not sent yet
//         const withdrawals = await Withdrawal.find({
//             approved: 'approved', // Only process admin-approved withdrawals
//             moneySent: false, // Money not sent yet
//         })
//             .populate('rider')
//             .populate('vendor');

//         console.log(` Found ${withdrawals.length} approved withdrawals to send money`);

//         for (const withdrawal of withdrawals) {
//             try {
//                 // CALCULATE SERVICE CHARGE AND ACTUAL AMOUNT TO SEND
//                 const requestedAmount = withdrawal.amount; // Amount user requested (e.g., 1000)
//                 const serviceCharge = requestedAmount * 0.10; // 10% service charge (100)
//                 const amountToSend = requestedAmount - serviceCharge; // Amount to actually send (900)
                
//                 // Log the breakdown
//                 console.log(`\n Processing withdrawal ${withdrawal._id}`);
//                 console.log(` User requested: ₦${requestedAmount}`);
//                 console.log(` Service charge (10%): ₦${serviceCharge}`);
//                 console.log(` Amount to send: ₦${amountToSend}`);
//                 console.log(` Account: ${withdrawal.accountName} - ${withdrawal.accountNumber}`);
//                 console.log(` Bank: ${withdrawal.bankName || 'Not specified'}`);

//                 const headers = {
//                     Authorization: `Bearer ${PAYSTACK_SECRET}`,
//                     "Content-Type": "application/json",
//                 };

//                 // Get bank code if not available
//                 let bankCode = withdrawal.bankCode;
//                 let verifiedAccountName = withdrawal.accountName;

//                 if (!bankCode) {
//                     const resolveResult = await getBankCodeFromAccount(
//                         withdrawal.accountNumber, 
//                         withdrawal.accountName,
//                         withdrawal.bankName
//                     );
                    
//                     if (resolveResult.success) {
//                         bankCode = resolveResult.bankCode;
//                         withdrawal.bankCode = bankCode;
//                         withdrawal.bankName = resolveResult.bankName || withdrawal.bankName;
//                         verifiedAccountName = resolveResult.accountName || withdrawal.accountName;
//                         withdrawal.accountName = verifiedAccountName; // Update with verified name
//                         await withdrawal.save();
//                         console.log(` Got bank code: ${bankCode} for ${withdrawal.bankName}`);
//                     } else {
//                         console.log(` Cannot get bank code: ${resolveResult.error}`);
//                         withdrawal.failedAttempts = (withdrawal.failedAttempts || 0) + 1;
//                         withdrawal.lastError = `Bank resolution error: ${resolveResult.error}`;
//                         withdrawal.lastAttemptAt = new Date();
//                         await withdrawal.save();
//                         continue;
//                     }
//                 }

//                 // 1. Create recipient
//                 console.log(` Creating recipient...`);
//                 const recipientResponse = await axios.post(
//                     "https://api.paystack.co/transferrecipient",
//                     {
//                         type: "nuban",
//                         name: verifiedAccountName,
//                         account_number: withdrawal.accountNumber,
//                         bank_code: bankCode,
//                         currency: "NGN"
//                     },
//                     { 
//                         headers,
//                         timeout: 10000 
//                     }
//                 );

//                 if (!recipientResponse.data.status) {
//                     throw new Error(recipientResponse.data.message || 'Failed to create recipient');
//                 }

//                 const recipientCode = recipientResponse.data.data.recipient_code;
//                 console.log(` Recipient created: ${recipientCode}`);
//                 const transferReference = `wd_${withdrawal._id}_${Date.now()}`;

//                 // 2. Send transfer - SEND THE REDUCED AMOUNT (900)
//                 console.log(` Sending ₦${amountToSend} (after 10% service charge)...`);
//                 const transferResponse = await axios.post(
//                     "https://api.paystack.co/transfer",
//                     {
//                         source: "balance",
//                         amount: Math.round(amountToSend * 100), // Convert to kobo (90000)
//                         recipient: recipientCode,
//                         reason: `Withdrawal ${withdrawal.reference} (10% service charge applied)`,
//                         reference: transferReference
//                     },
//                     { 
//                         headers,
//                         timeout: 15000 
//                     }
//                 );

//                 if (!transferResponse.data.status) {
//                     throw new Error(transferResponse.data.message || 'Transfer failed');
//                 }

//                 const transferData = transferResponse.data.data;
//                 console.log(` Transfer initiated: ${transferData.reference}`);
//                 console.log(` Transfer status: ${transferData.status}`);

//                 // 3. Update withdrawal - MONEY SENT!
//                 withdrawal.moneySent = true;
//                 withdrawal.transferId = transferData.id;
//                 withdrawal.transferReference = transferData.reference;
//                 withdrawal.transferStatus = transferData.status;
//                 withdrawal.processedAt = new Date();
//                 withdrawal.approved = 'completed';
                
//                 // Store service charge and actual sent amount in withdrawal record
//                 withdrawal.serviceCharge = serviceCharge;
//                 withdrawal.amountSent = amountToSend;
//                 withdrawal.originalAmount = requestedAmount;

//                 await withdrawal.save();

//                 console.log(` Money sent successfully! Status changed to COMPLETED`);
//                 console.log(` User received: ₦${amountToSend}, Service charge: ₦${serviceCharge}`);
//                 console.log(` Send notification email to user`);

//                 // 4. Update user's wallet balance - DEDUCT THE FULL REQUESTED AMOUNT (1000)
//                 if (withdrawal.rider) {
//                     await Rider.findByIdAndUpdate(withdrawal.rider._id, {
//                         $inc: { withdrawalBalance: -requestedAmount } // Deduct 1000
//                     });
//                     console.log(` Updated rider's withdrawal balance: -₦${requestedAmount}`);
//                 } else if (withdrawal.vendor) {
//                     await Vendor.findByIdAndUpdate(withdrawal.vendor._id, {
//                         $inc: { withdrawalBalance: -requestedAmount } // Deduct 1000
//                     });
//                     console.log(` Updated vendor's withdrawal balance: -₦${requestedAmount}`);
//                 }

//                 // 5. Update admin/company wallet with service charge
//                 // You need to add this logic to credit your admin/company account
//                 console.log(` Service charge of ₦${serviceCharge} collected`);
//                 // TODO: Add code to credit admin/company wallet with serviceCharge

//             } catch (error) {
//                 console.error(` Failed to process withdrawal:`, error.response?.data || error.message);

//                 withdrawal.failedAttempts = (withdrawal.failedAttempts || 0) + 1;
//                 withdrawal.lastError = error.response?.data?.message || error.message;
//                 withdrawal.lastAttemptAt = new Date();
                
//                 // If too many failures, mark as failed
//                 if (withdrawal.failedAttempts >= 3) {
//                     withdrawal.approved = 'failed';
//                     console.log(` Withdrawal marked as FAILED after 3 attempts`);
//                 }
                
//                 await withdrawal.save();
//             }
//         }

//         console.log('\n Cron job completed');

//     } catch (error) {
//         console.error(' Cron job error:', error);
//     }
// }

// // Additional function to check transfer status
// async function checkTransferStatus(transferReference) {
//     try {
//         const headers = {
//             Authorization: `Bearer ${PAYSTACK_SECRET}`,
//         };

//         const response = await axios.get(
//             `https://api.paystack.co/transfer/${encodeURIComponent(transferReference)}`,
//             { headers }
//         );

//         return {
//             success: true,
//             data: response.data.data
//         };
//     } catch (error) {
//         return {
//             success: false,
//             error: error.response?.data?.message || error.message
//         };
//     }
// }

// module.exports = { 
//     sendMoneyForApprovedWithdrawals,
//     checkTransferStatus 
// };
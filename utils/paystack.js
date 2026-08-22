// utils/paystack.js

const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Get bank code from account number using Paystack API
async function getBankCodeFromAccount(accountNumber, accountName, bankName = '') {
    try {
        const headers = {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
        };

        console.log(`Resolving account ${accountNumber}...`);

        // Step 1: Get list of all banks from Paystack
        console.log('Fetching banks list from Paystack...');
        const banksResponse = await axios.get("https://api.paystack.co/bank", {
            headers,
            params: {
                country: 'nigeria',
                currency: 'NGN'
            }
        });

        if (!banksResponse.data.data || !banksResponse.data.data.length) {
            return { success: false, error: 'No banks available from Paystack' };
        }

        const banks = banksResponse.data.data;
        console.log(`Total banks available: ${banks.length}`);

        // Step 2: Try to find bank by name if provided
        if (bankName) {
            const normalizedBankName = bankName.toLowerCase().trim();
            
            const foundBank = banks.find(bank => 
                bank.name.toLowerCase().includes(normalizedBankName) ||
                normalizedBankName.includes(bank.name.toLowerCase())
            );

            if (foundBank) {
                console.log(`Found bank: ${foundBank.name} (${foundBank.code})`);
                
                try {
                    const verifyResponse = await axios.get(
                        `https://api.paystack.co/bank/resolve`,
                        {
                            headers,
                            params: {
                                account_number: accountNumber,
                                bank_code: foundBank.code
                            },
                            timeout: 10000
                        }
                    );

                    if (verifyResponse.data.status === true && verifyResponse.data.data) {
                        console.log(`Account verified: ${verifyResponse.data.data.account_name}`);
                        return {
                            success: true,
                            bankCode: foundBank.code,
                            bankName: foundBank.name,
                            accountName: verifyResponse.data.data.account_name
                        };
                    }
                } catch (verifyError) {
                    console.log(`Account verification failed for ${foundBank.name}: ${verifyError.response?.data?.message || verifyError.message}`);
                }
            } else {
                console.log(`Bank "${bankName}" not found in Paystack banks list`);
            }
        }

        // Step 3: Try common banks first
        console.log('Trying common banks for account resolution...');
        const commonBankCodes = ['057', '058', '011', '044', '033', '070', '232'];
        
        for (const bankCode of commonBankCodes) {
            try {
                const resolveResponse = await axios.get(
                    `https://api.paystack.co/bank/resolve`,
                    {
                        headers,
                        params: {
                            account_number: accountNumber,
                            bank_code: bankCode
                        },
                        timeout: 5000
                    }
                );

                if (resolveResponse.data.status === true && resolveResponse.data.data) {
                    const bank = banks.find(b => b.code === bankCode);
                    console.log(`Account resolved with ${bank?.name || 'Unknown Bank'} (${bankCode}): ${resolveResponse.data.data.account_name}`);
                    return {
                        success: true,
                        bankCode: bankCode,
                        bankName: bank?.name || 'Unknown',
                        accountName: resolveResponse.data.data.account_name
                    };
                }
            } catch (error) {
                continue;
            }
        }

        // Step 4: Try all banks
        console.log('Trying all available banks for account resolution...');
        for (const bank of banks) {
            try {
                const resolveResponse = await axios.get(
                    `https://api.paystack.co/bank/resolve`,
                    {
                        headers,
                        params: {
                            account_number: accountNumber,
                            bank_code: bank.code
                        },
                        timeout: 3000
                    }
                );

                if (resolveResponse.data.status === true && resolveResponse.data.data) {
                    console.log(`Account resolved with ${bank.name} (${bank.code}): ${resolveResponse.data.data.account_name}`);
                    return {
                        success: true,
                        bankCode: bank.code,
                        bankName: bank.name,
                        accountName: resolveResponse.data.data.account_name
                    };
                }
            } catch (error) {
                continue;
            }
        }

        return { 
            success: false, 
            error: 'Could not resolve bank code. Account number might be invalid or bank not supported.' 
        };

    } catch (error) {
        console.error(`Error resolving account:`, error.response?.data || error.message);
        return { 
            success: false, 
            error: error.response?.data?.message || error.message 
        };
    }
}

module.exports = {
    getBankCodeFromAccount,
};
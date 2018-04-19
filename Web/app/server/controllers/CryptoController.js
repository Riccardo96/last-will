var EasyCrypto = require('easy-eth-crypto');
var EthereumController = require('./EthereumController');

/**
 * Ether private key is needed
 */
exports.isEtherKeySet = function(req,res,next){
    if (req.body.privateKey) {
        req.eth = EasyCrypto.CreateIdentityByPrivateKey(req.body.privateKey);
        return next();
    }
    return res.status(400).json({message: "Ethereum private key is needed"});
};

/**
 * Save your password into the Blockchain
 */
exports.savePassword = async function (req, res) {
    if (req.body.password && req.body.keys) {
        var password = req.body.password;
        var keys = req.body.keys.split(";");
        if (password.length < 20) {
            return res.status(400).json({message: "Password too small. Minimum 20 characters."});
        }

        // Decompose password
        var nParts = keys.length;
        var pLength = password.length;
        var parts = exports.splitString(password, (pLength / nParts));

        // Check equal parts and keys
        if (parts.length !== keys.length) {
            return res.status(400).json({message: "Something went wrong."});
        }

        // Each Public Key
        var encryptedParts = [];
        for (var i in keys) {
            var friendPublicKey = keys[i];
            var part = parts[i];
            var friendAddress = EasyCrypto.PublicKeyToAddress(friendPublicKey);

            // Encrypt with user public key
            var encrypted = await EasyCrypto.EncryptTextAsymmetric(part, friendPublicKey);

            // Send to Smart Contract
            var result = EthereumController.addHierarchy(req.eth.address, friendAddress, encrypted, i);
            if (result === false) {
                return res.status(400).json({message: "Error saving to Smart Contract"});
            }
            encryptedParts.push({address: friendAddress, encrypted: encrypted, order: i});
        }

        // Cehck the smart contract has all keys
        var nPartsInContract = EthereumController.getNumberHierarchyUsers(req.eth.address);
        if (nParts !== nPartsInContract) {
            return res.status(400).json({message: "Error saving to Smart Contract"});
        }

        return res.status(200).json({parts: nParts, encrypted: encryptedParts});
    }
    return res.status(400).json({message: "Invalid parameters"});
};

exports.splitString = function (str, chunkSize) {
    var chunks = [];
    while (str) {
        if (str.length < chunkSize) {
            chunks[chunks.length-1] += str;
            break;
        }
        else {
            chunks.push(str.substr(0, chunkSize));
            str = str.substr(chunkSize);
        }
    }
    return chunks;
};

/**
 * Recover your password from the Blockchain
 */
exports.recoverPassword = async function (req, res) {
    if (req.body.lostAddress) {
        var lostAddress = req.body.lostAddress;

        // Get form smart contract my encrypted part of the lost address
        var parts = EthereumController.getFullKey(req.eth.address, lostAddress);

        // Each part
        var fullKey = "";
        for (var part of parts) {
            if (part !== "") {
                var decrypted = await EasyCrypto.DecryptTextAsymmetric(part, req.eth.privateKey);
                fullKey += decrypted;
            }
        }

        return res.status(200).json({recoveredKey: fullKey});
    }
    return res.status(400).json({message: "Invalid parameters"});
};

/**
 * Recover a password part from the blockchain
 */
exports.recoverPasswordPart = async function (req, res) {
    if (req.body.lostAddress && req.body.newPublicKey) {
        var lostAddress = req.body.lostAddress;
        var newPublicKey = req.body.newPublicKey;
        var newAddress = EasyCrypto.PublicKeyToAddress(newPublicKey);

        // Get form smart contract my encrypted part of the lost address
        var key = EthereumController.getMyKeyPart(req.eth.address, lostAddress);

        // Decrypt it
        var decrypted = await EasyCrypto.DecryptTextAsymmetric(key.key, req.eth.privateKey);

        // Now encrypt with the new address
        var reEncrypted = await EasyCrypto.EncryptTextAsymmetric(decrypted, newPublicKey);

        // Send to Smart Contract the encrypted part
        var status = EthereumController.addRestoreKey(req.eth.address, lostAddress, newAddress, reEncrypted, key.index);

        return res.status(200).json({status: status});
    }
    return res.status(400).json({message: "Invalid parameters"});
};

/**
 * Parse private key to public and address
 */
exports.parsePrivateKey = function(req, res) {
    if (req.body.privateKey) {
        var identity = EasyCrypto.CreateIdentityByPrivateKey(req.body.privateKey);
        return res.status(200).json(identity);
    }
    return res.status(400).json({message: "Invalid parameters"});
};
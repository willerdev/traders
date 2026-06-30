"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    await prisma.platformConfig.upsert({
        where: { id: 'default' },
        update: { requireKycForPayouts: true },
        create: {
            id: 'default',
            registrationFeeUsdt: 5,
            traderPayoutPercent: 40,
            platformPayoutPercent: 60,
            riskPercent: 2,
            startingBalance: 1000,
            winPoints: 10,
            lossPoints: -5,
            duplicateThreshold: 0.9,
            entryTolerancePercent: 0.2,
            tpRewardUsd: 10,
            requireKycForPayouts: true,
        },
    });
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@traderrank.pro';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!ChangeMe';
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });
    if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash,
                displayName: 'Platform Admin',
                role: 'ADMIN',
                status: 'ACTIVE',
                emailVerified: true,
                registrationPaid: true,
                termsAcceptedAt: new Date(),
                virtualAccount: {
                    create: {
                        balance: 1000,
                        maxRiskPerTrade: 20,
                        riskPercent: 2,
                    },
                },
            },
        });
        console.log(`Admin user created: ${adminEmail}`);
    }
    else if (existingAdmin.role !== 'ADMIN') {
        await prisma.user.update({
            where: { email: adminEmail },
            data: { role: 'ADMIN', status: 'ACTIVE' },
        });
        console.log(`Promoted ${adminEmail} to ADMIN`);
    }
    console.log('Platform config seeded');
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map
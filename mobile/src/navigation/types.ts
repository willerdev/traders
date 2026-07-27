export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Otp: { loginSessionId: string; email: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  RegistrationPayment: undefined;
  Payouts: undefined;
};

export type JournalStackParamList = {
  JournalMain: undefined;
};

export type WalletStackParamList = {
  WalletMain: undefined;
  Deposit: undefined;
  Withdraw: undefined;
  Transactions: undefined;
  Journal: undefined;
  SavedWallets: undefined;
};

export type InvestStackParamList = {
  InvestMain: undefined;
  ChainEnroll: undefined;
};

export type MoreStackParamList = {
  MoreMain: undefined;
  MessagesMain: undefined;
  SettingsMain: undefined;
  Payouts: undefined;
  Terms: undefined;
  Kyc: undefined;
  ChainEnroll: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Journal: undefined;
  Invest: undefined;
  Wallet: undefined | { screen?: keyof WalletStackParamList };
  More: undefined | { screen?: keyof MoreStackParamList };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

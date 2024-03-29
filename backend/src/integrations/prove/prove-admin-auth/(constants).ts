import { AppEnvSelect } from '@src/(global_constants)/index';

export const ADMIN_USER_ID_PROD = process.env.ADMIN_USER_ID!;
export const ADMIN_USER_ID_SANDBOX = process.env.ADMIN_USER_ID_SANDBOX!;
export const ADMIN_OAUTH_HASHING_SECRET =
  process.env.ADMIN_OAUTH_HASHING_SECRET;

export const ADMIN_PREFILL_CREDENTIALS: {
  [type in AppEnvSelect]: { username: string; password: string };
} = {
  [AppEnvSelect.PRODUCTION]: {
    username: process.env.ADMIN_PREFILL_USERNAME_PROD!,
    password: process.env.ADMIN_PREFILL_PASSWORD_PROD!,
  },
  [AppEnvSelect.SANDBOX]: {
    username: process.env.ADMIN_PREFILL_USERNAME_SANDBOX!,
    password: process.env.ADMIN_PREFILL_PASSWORD_SANDBOX!,
  },
};

export const ADMIN_PREFILL_CLIENT_IDS: {
  [type in AppEnvSelect]: { clientId: string; subClientId: string };
} = {
  [AppEnvSelect.PRODUCTION]: {
    clientId: process.env.ADMIN_PREFILL_CLIENT_ID_PROD!,
    subClientId: process.env.ADMIN_PREFILL_SUB_CLIENT_ID_PROD!,
  },
  [AppEnvSelect.SANDBOX]: {
    clientId: process.env.ADMIN_PREFILL_CLIENT_ID_SANDBOX!,
    subClientId: process.env.ADMIN_PREFILL_SUB_CLIENT_ID_SANDBOX!,
  },
};

//package import
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
//module import
import { asyncMiddleware } from '@src/api/api.middleware';
import {
  validatePhoneNumber,
  validateSourceIP,
} from '@src/lib/validators/common-validators';
import {
  PrefillColatedRecord,
  createInitialPrefillRecords,
  getRecords,
  updateInitialPrefillRecords,
} from '@src/data-repositories/prefill.repository';
import PossessionOrchestratorService from '@src/services/possesion/possesion-orchestrator.service';
import ReputationOrchestratorService from '@src/services/reputation/reputation-orchestrator.service';
import OwnershipOrchestratorService from '@src/services/ownership/ownership-orchestrator.service';
import { CreateRecordsParams, GetRecordsParams } from './(constants)';
import { JWT } from '@src/helpers/jwt.helper';

export const getEchoEndpoint = asyncMiddleware(
  async (req: Request, res: Response, _next: NextFunction, _err: any) => {
    try {
      return res.status(StatusCodes.OK).json({
        message: 'ok',
        success: true,
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

export const createInitialPrefillToken = asyncMiddleware(
  async (req: Request, res: Response, _next: NextFunction, _err: any) => {
    try {
      const { userId, sessionId, isMobile = false } = req.body;
      // Validate phoneNumber and sourceIP
      if (!userId || !sessionId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'userId and sessionId are required.',
        });
      }

      // Create prefill records
      const prefillParams: CreateRecordsParams = {
        userId: userId as string,
        sessionId: sessionId as string,
        isMobile,
      };
      const result = await createInitialPrefillRecords(prefillParams);
      console.log('result is: ', result);

      if (!result) {
        throw new Error('invalid config');
      }
      const accessToken = JWT.sign({
        subject: userId,
        jwtid: sessionId,
      });

      return res.status(StatusCodes.OK).json({
        token_type: 'Bearer',
        access_token: accessToken,
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

export const postAuthUrl = asyncMiddleware(
  async (req: Request, res: Response, _next: NextFunction, _err: any) => {
    try {
      const phoneNumber: string = req.body.phoneNumber;
      const sourceIP: string = req.body.sourceIP;

      // Validate phoneNumber and sourceIP
      if (!phoneNumber) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Phone number is required.',
        });
      }

      const isPhoneNumberValid = validatePhoneNumber(phoneNumber);
      const isSourceIPValid = validateSourceIP(sourceIP || '127.0.0.1');

      if (!isPhoneNumberValid || !isSourceIPValid) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Invalid phone number or source IP.',
        });
      }

      // Update prefill records
      const prefillParams: GetRecordsParams = {
        phoneNumber: phoneNumber,
        sourceIP: sourceIP,
        id: req.prefillRecordId,
      };
      await updateInitialPrefillRecords(prefillParams);

      const prefillOrchestrator = new PossessionOrchestratorService(
        req.prefillRecordId,
      );
      await prefillOrchestrator.execute();
      console.log('PrefillOrchestrator executed successfully.');

      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: true,
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

//Check if text has been sent within last 5 mins and then just resend the text to the phone number
export const resendSMS = asyncMiddleware(
  async (req: Request, res: Response, _next: NextFunction, _err: any) => {
    try {
      const { prefillRecord, requestDetail } = await getRecords({
        id: req.prefillRecordId,
      });

      const { sms_sent_date_time: smsSentDateTime, sms_sent_count: smsSendCount } = prefillRecord;
      const phoneNumber = requestDetail?.payload?.MobileNumber;

      // Validate phoneNumber and sourceIP
      if (!phoneNumber || !smsSentDateTime) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Error resending text.',
        });
      }

      if (smsSendCount && smsSendCount >= 4) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Limit reached for resending link.',
        });
      }

      const prefillOrchestrator = new PossessionOrchestratorService(
        req.prefillRecordId,
      );
      await prefillOrchestrator.execute();
      console.log('PrefillOrchestrator executed successfully.');

      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: true,
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

export const verifyInstantLink = asyncMiddleware(
  async (
    { query: { vfp = '', userAuthGuid = '' }, prefillRecordId }: Request,
    res: Response,
    _next: NextFunction,
    _err: any,
  ) => {
    try {
      // Checking if vfp or userAuthGuid is empty or undefined
      if (!vfp || !userAuthGuid) {
        throw new Error('Both vfp and userAuthGuid are required.');
      }

      const prefillResult: PrefillColatedRecord = await getRecords({
        id: prefillRecordId,
      });
      if (prefillResult && prefillResult.prefillRecord) {
        const prefillOrchestrator = new PossessionOrchestratorService(
          prefillResult.prefillRecord.id,
        );
        await prefillOrchestrator.finalize(vfp as string);
        console.log('PrefillOrchestrator finalized successfully.');
      } else {
        console.error('PrefillOrchestrator failed.');
        throw new Error('PrefillOrchestrator failed.');
      }

      //TODO: determine how to handle lack of access token here
      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: true,
        isMobile: prefillResult?.prefillRecord?.is_mobile || false,
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

export const getVerifyStatus = asyncMiddleware(
  async (
    { prefillRecordId }: Request,
    res: Response,
    _next: NextFunction,
    _err: any,
  ) => {
    try {
      const { prefillRecord } = await getRecords({
        id: prefillRecordId,
      });
      const { state } = prefillRecord;
      return res.status(StatusCodes.OK).json({ state });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

export const checkEligibility = asyncMiddleware(
  async (
    { prefillRecordId }: Request,
    res: Response,
    next: NextFunction,
    _err: any,
  ) => {
    try {
      const prefillResult: any = await getRecords({ id: prefillRecordId });
      const reputationOrchestrator = new ReputationOrchestratorService(
        prefillResult.prefillRecord.id,
      );
      const result = await reputationOrchestrator.execute();
      if (result) {
        console.log('Reputation Orchestrator service successfully run!');
      } else {
        console.error('ReputationOrchestrator failed!');
        throw new Error('ReputationOrchestrator failed!');
      }
      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: true,
      });
    } catch (error) {
      console.log(error);
      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: false,
      });
    }
  },
);

export const getIdentity = asyncMiddleware(
  async (
    { prefillRecordId, body: { last4 = '', dob = '' } }: Request,
    res: Response,
  ) => {
    try {
      if (!dob && !last4) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: 'Date of birth and/or last 4 of SSN is required.' });
      }
      const { responseDetails } = await getRecords({ id: prefillRecordId });
      const { trust_score: trustScore }: any =
        responseDetails?.payload?.success_trust_response;
      if (!trustScore) {
        return res
          .status(StatusCodes.UNPROCESSABLE_ENTITY)
          .json({ error: 'Eligibility check is required.' });
      }
      const ownerOrchestrator = new OwnershipOrchestratorService(
        prefillRecordId,
      );
      const identityVerifysuccess = await ownerOrchestrator.execute({ last4, dob });
      //TODO: Check with Diontre; CONFIRM THAT FOR AT&T payload for prefill (does nothing return for those users)
      if (identityVerifysuccess) {
        const prefillResult = await getRecords({ id: prefillRecordId });
        const { success_identity_response: successIdentityResponse } =
          prefillResult.responseDetails.payload;
        const responseObject = {
          message: 'ok',
          verified: true,
          manualEntryRequired: !successIdentityResponse,
          prefillData: successIdentityResponse || null,
        };
        return res.status(StatusCodes.OK).json(responseObject);
      } else {
        const responseObject = {
          message: 'ok',
          verified: false,
          manualEntryRequired: false,
          prefillData: null,
        };
        return res.status(StatusCodes.OK).json(responseObject);
      }
    } catch (error) {
      console.error(error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'ok',
        verified: false,
        manualEntryRequired: false,
        prefillData: null,
      });
    }
  },
);

export const confirmIdentity = asyncMiddleware(
  async (
    {
      prefillRecordId,
      body: {
        firstName,
        lastName,
        dob,
        last4,
        city,
        address,
        extendedAddress = '',
        region,
        postalCode,
      },
    }: Request,
    res: Response,
    _next: NextFunction,
    _err: any,
  ) => {
    try {
      const prefillResult: any = await getRecords({ id: prefillRecordId });
      const ownerOrchestrator = new OwnershipOrchestratorService(
        prefillResult.prefillRecord.id,
      );
      const proveResult: boolean = await ownerOrchestrator.finalize({
        first_name: firstName,
        last_name: lastName,
        dob,
        last4,
        city,
        address,
        extended_address: extendedAddress,
        region,
        postal_code: postalCode,
      });
      if (proveResult) {
        console.log('OwnershipOrchestratorService successfully run.');
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: true,
        });
      } else {
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: false,
        });
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);

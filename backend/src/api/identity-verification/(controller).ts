//package import
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
//module import
import { AppEnvSelect } from 'src/(global_constants)';
import { asyncMiddleware } from '@src/api/api.middleware';
import {
  validatePhoneNumber,
  validateSourceIP,
} from '@src/helpers/validation.helper';
import {
  findOrCreateInitialPrefillRecords,
  getRecords,
  updateInitialPrefillRecords,
} from '@src/data-repositories/prefill.repository';
import PossessionOrchestratorService from '@src/services/possession/possesion-orchestrator.service';
import ReputationOrchestratorService from '@src/services/reputation/reputation-orchestrator.service';
import OwnershipOrchestratorService from '@src/services/ownership/ownership-orchestrator.service';
import { CreateRecordsParams, GetRecordsParams } from '@src/api/identity-verification/(constants)';
import { JWT } from '@src/helpers/jwt.helper';
import PrefillWithoutMnoConsent from '@src/models/prefill-without-mno-consent';
import { SMS_RESEND_CAP } from '@src/services/possession/(constants)';
import { IdentityServiceResponse, SuccessIdentityResponse } from '@src/services/ownership/(definitions)';

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
      const result = await findOrCreateInitialPrefillRecords(prefillParams);
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
      const requestDetail = req?.requestDetail;
      const phoneNumber = req.body.phoneNumber || requestDetail?.payload?.MobileNumber;
      const sourceIP: string = req?.body?.sourceIP || '127.0.0.1';
      const last4: string = req.body.last4 || requestDetail?.payload?.Last4;

      // Validate phoneNumber and sourceIP
      if (!phoneNumber) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Phone number is required.',
        });
      }

      const isPhoneNumberValid = process.env.NODE_ENV === AppEnvSelect.PRODUCTION ? validatePhoneNumber(phoneNumber) : phoneNumber.length === 12;
      const isSourceIPValid = validateSourceIP(sourceIP);

      if (!isPhoneNumberValid || !isSourceIPValid) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Invalid phone number or source IP.',
        });
      }

      // Update prefill records
      const prefillParams: GetRecordsParams = {
        id: req.prefillRecordId,
        sourceIP: sourceIP,
        phoneNumber: phoneNumber,
        last4, 
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
      const { prefillRecord, requestDetail } = req; 

      const { sms_sent_date_time: smsSentDateTime = '', sms_sent_count: smsSendCount = 0 } = prefillRecord as PrefillWithoutMnoConsent;
      const phoneNumber = requestDetail?.payload?.MobileNumber;

      // Validate phoneNumber and sourceIP
      if (!phoneNumber || !smsSentDateTime) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Error resending text.',
        });
      }

      //enforce cap on sending SMS
      if (smsSendCount && smsSendCount >= SMS_RESEND_CAP) {
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
  async ({ 
    query: { vfp = '', userAuthGuid = '' }, 
    body: { isMobile: requestIsMobile = false },
    prefillRecordId, 
    isMobile, 
    prefillRecord, 
    requestDetail 
  }: Request,
    res: Response,
    _next: NextFunction,
    _err: any,
  ) => {
    try {
      // Checking if vfp or userAuthGuid is empty or undefined
      if (!vfp || !userAuthGuid) {
        throw new Error('Both vfp and userAuthGuid are required.');
      }

      const prefillOrchestrator = new PossessionOrchestratorService(
        prefillRecordId,
      );
      await prefillOrchestrator.finalize(vfp as string);
      console.log('PrefillOrchestrator finalized successfully.');
      
      //validates if session was started on a mobile device AND request was sent from mobileDevice to return access_token to continue session inside mobile device (isMobile is validated on token creation)
      if (isMobile && requestIsMobile) {
        const accessToken = JWT.sign({
          subject: prefillRecord?.user_id,
          jwtid: prefillRecord?.session_id,
        });
        const last4 = requestDetail?.payload?.Last4 || null;

        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: true,
          isMobile: isMobile,
          access_token: accessToken,
          last4
        });
      } else {
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: true,
        });
      }
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
      const reputationOrchestrator = new ReputationOrchestratorService(
        prefillRecordId,
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
        return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Date of birth and/or last 4 of SSN is required.' });
      }

      const proveResult: any = await getRecords({ id: prefillRecordId });
      const trustScore: number = proveResult?.responseDetails?.payload?.success_trust_response?.trust_score || 0;

      if (!trustScore) {
        return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ error: 'Eligibility check is required.' });
      }

      const ownerOrchestrator = new OwnershipOrchestratorService(prefillRecordId);
      const identityVerifySuccess = await ownerOrchestrator.execute({ last4, dob });

      if (!identityVerifySuccess) {
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: false,
          manualEntryRequired: false,
          prefillData: null,
        });
      }

      const prefillResult = await getRecords({ id: prefillRecordId });
      const successIdentityResponse = prefillResult?.responseDetails?.payload?.success_identity_response as SuccessIdentityResponse;

      return res.status(StatusCodes.OK).json({
        message: 'ok',
        verified: true,
        manualEntryRequired: successIdentityResponse?.manual_entry_required === true,
        prefillData: successIdentityResponse?.manual_entry_required ? null : successIdentityResponse,
      });
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
        dob = '',
        last4 = '',
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
      const ownerOrchestrator = new OwnershipOrchestratorService(
        prefillRecordId,
      );
      const proveResult: IdentityServiceResponse = await ownerOrchestrator.finalize({
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
      if (proveResult?.verified === true) {
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: true,
        });
      } else {
        return res.status(StatusCodes.OK).json({
          message: 'ok',
          verified: false,
          ownershipCapReached: proveResult?.ownershipCapReached || false
        });
      }
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
      const { state, is_mobile: isMobile = false } = prefillRecord;
      return res.status(StatusCodes.OK).json({ state, isMobile });
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
);
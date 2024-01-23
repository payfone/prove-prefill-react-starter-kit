import { Prove } from '@src/integrations/prove/index';
import { AppEnvSelect } from 'src/(global_constants)';
import { convertObjectKeysToSnakeCase } from '@src/helpers/validation.helper';
import { AuthState } from '@src/integrations/prove/(constants)';
import { ProvePrefillResult } from '@src/integrations/prove/prove.definitions';

interface ApiResponse {
  body: any;
  status: number;
  success: boolean;
}

interface ResponseDetail {
  payload: {
    redirect_url: string;
    mobile_number: string;
  };
  update: (payload: any) => Promise<void>;
}

interface ObjectArgs {
  requestDetail: {
    request_id: string;
    payload: {
      MobileNumber: string;
    };
  };
  responseDetails: any;
  prefillRecord: any;
}

export default class IdentityVerifyService {
  private object: ObjectArgs;
  private requestDetail: any;
  private responseDetail: ResponseDetail;
  private mobileNumber: string;

  constructor(args: ObjectArgs) {
    this.object = args;
    this.requestDetail = this.object.requestDetail;
    this.responseDetail = this.object.responseDetails;
    this.mobileNumber = this.requestDetail.payload.MobileNumber || '';
  }

  public async run({ last4, dob }: { last4?: string; dob?: string; }): Promise<boolean> {
    if (this.mobileNumber) {
      const proveService = new Prove();
      const response = await proveService.identity(
        this.mobileNumber,
        dob,
        last4,
        this.requestDetail.request_id,
      );

      if (response.verified) {
        this.object.prefillRecord.update({
          state: AuthState.IDENTITY_VERIFY,
          manual_entry_required: response?.manualEntryRequired
        });
        await this.requestDetail.update({ state: AuthState.IDENTITY_VERIFY });
        await this.updateResponse(response);
        return true;
      } else {
        //lock user out of attempts (need global flag for verified (fully verified))
        this.object.prefillRecord.update({
          state: AuthState.IDENTITY_VERIFY,
          verified: false,
        });
        return false;
      }
    } else {
      console.error('MobileNumber is not present!');
      return false;
    }
  }

  private async updateResponse(response: ProvePrefillResult): Promise<void> {
    const currentPayload = this.responseDetail.payload || {};
    const updatedPayload = {
      ...currentPayload,
      success_identity_response: convertObjectKeysToSnakeCase(response),
    };
    // Update the payload attribute of the record with the new data
    await this.responseDetail.update({
      parent_state: AuthState.IDENTITY_VERIFY,
      payload: updatedPayload,
    });
  }
}

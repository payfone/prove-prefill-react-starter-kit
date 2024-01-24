import { Prove } from '@src/integrations/prove/index';
import { convertObjectKeysToSnakeCase } from '@src/helpers/validation.helper';
import { AuthState } from '@src/integrations/prove/(constants)';
import { ProvePrefillResult } from '@src/integrations/prove/prove.definitions';
import { PrefillColatedRecord } from '@src/data-repositories/prefill.repository';
import PrefillServiceBase from '../service.base';

export default class IdentityVerifyService extends PrefillServiceBase {
  private mobileNumber: string;

  constructor(args: Partial<PrefillColatedRecord>) {
    super(args);
    this.mobileNumber = this?.requestDetail?.payload?.MobileNumber as string || ''
  }

  public async run({ last4, dob }: { last4?: string; dob?: string; }): Promise<boolean> {
    if (!this.mobileNumber) {
      console.error('MobileNumber is not present!');
      return false;
    }

    const proveService = new Prove();
    const response = await proveService.identity(
      this.mobileNumber,
      dob,
      last4,
      this.requestDetail.request_id,
    );

    const updatePayload = {
      state: AuthState.IDENTITY_VERIFY,
      manual_entry_required: response?.manualEntryRequired,
      verified: response.verified
    };

    this.prefillRecord.update(updatePayload);

    if (response.verified) {
      await this.requestDetail.update({ state: AuthState.IDENTITY_VERIFY });
      await this.updateResponse(response);
    }

    return response.verified;
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

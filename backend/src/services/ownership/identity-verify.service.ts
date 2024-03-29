import { AuthState } from '@src/integrations/prove/(constants)';
import { ProvePrefillResult } from '@src/integrations/prove/(definitions)';
import { PrefillColatedRecord } from '@src/data-repositories/prefill.repository';
import PrefillServiceBase from '@src/services/service.base';
import { IdentityVerifyRunArgs } from '@src/services/ownership/(definitions)';
import { ServiceType } from '@src/services/(definitions)';

export default class IdentityVerifyService extends PrefillServiceBase {
  private mobileNumber: string;

  constructor(args: Partial<PrefillColatedRecord>) {
    super(ServiceType.IDENTITY_VERIFY, args);
    this.mobileNumber = this?.requestDetail?.payload?.MobileNumber as string || ''
  }

  public async run({ last4, dob }: IdentityVerifyRunArgs): Promise<boolean> {
    if (!this.mobileNumber) {
      console.error('MobileNumber is not present!');
      return false;
    }

    const response = await this.ProveService.identity(
      this.mobileNumber,
      dob,
      last4
    );

    const updatePayload = {
      state: AuthState.IDENTITY_VERIFY,
      manual_entry_required: response?.manualEntryRequired,
    };
    this.prefillRecord.update(updatePayload);

    if (response.verified) {
      await this.requestDetail.update({ state: AuthState.IDENTITY_VERIFY });
      await this.updateResponse(response);
    }

    return response.verified;
  }

  protected async updateResponse(response: ProvePrefillResult): Promise<void> {
    const currentPayload = this.responseDetail.payload || {};
    const updatedPayload = {
      ...currentPayload,
      success_identity_response: {
        verified: response.verified,
        manual_entry_required: response?.manualEntryRequired || false,
        status: response.status,
        dob: response?.dob,
        last4: response?.last4,
        first_name: response.firstName,
        last_name: response.lastName,
        address: response.address,
        extended_address: response.extendedAddress,
        city: response.city,
        region: response.region,
        postal_code: response.postalCode,
      }      
    };
    // Update the payload attribute of the record with the new data
    await this.responseDetail.update({
      parent_state: AuthState.IDENTITY_VERIFY,
      payload: updatedPayload,
    });
  }

  protected async updateRequest() {
    throw new Error('not implemented for this service');
  }

  protected buildRequestPayload() {
    throw new Error('not implemented for this service');
  }
}
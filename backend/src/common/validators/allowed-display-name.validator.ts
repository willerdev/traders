import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isDisplayNameAllowed } from '../display-name.util';

@ValidatorConstraint({ name: 'allowedDisplayName', async: false })
export class AllowedDisplayNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    return isDisplayNameAllowed(value);
  }

  defaultMessage(): string {
    return 'This display name is reserved. Choose a name that does not impersonate platform staff or official accounts.';
  }
}

export function AllowedDisplayName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: AllowedDisplayNameConstraint,
    });
  };
}

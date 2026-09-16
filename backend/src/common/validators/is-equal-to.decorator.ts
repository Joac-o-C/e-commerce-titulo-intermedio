import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Compara el campo decorado contra otro campo del mismo DTO (ej. password
 * vs. confirmación). Usado por CU-01 (registro) y CU-08 (reset).
 */
export function IsEqualTo(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isEqualTo',
      target: object.constructor,
      propertyName,
      options,
      constraints: [property],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} debe coincidir con ${relatedPropertyName}`;
        },
      },
    });
  };
}

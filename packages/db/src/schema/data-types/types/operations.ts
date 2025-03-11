/**
 * Options for an object with the schema
 *
 * @property partial - determines whether the validation should be strict or lenient. If the validation is 'strict', all properties must be present and valid. If the validation is 'lenient', only the properties that are present in the input will be validated.
 */
export type ValidateOptions = {
  partial: boolean;
};

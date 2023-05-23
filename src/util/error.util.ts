type ErrorWithMessage = {
  message: string;
};

/**
 * Returns true if the error object has a message property. Otherwise false.
 * @param error error object or any other object
 * @returns true if the error object has a message property. Otherwise false.
 */
function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

/**
 * Returns an error object with a message. If the error object is not an error, it will be converted to an error object.
 * @param maybeError error object or any other object
 * @returns error object
 */
function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // fallback in case there's an error stringifying the maybeError
    // like with circular references for example.
    return new Error(String(maybeError));
  }
}

/**
 * Returns the error message from an error object. If the error object is not an error, it will be converted to an error object.
 * @param error error object or any other object
 * @returns error message
 */
function getErrorMessage(error: unknown) {
  return toErrorWithMessage(error).message;
}

export { getErrorMessage };

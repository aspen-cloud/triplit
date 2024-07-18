export function decodeToken(token: string, claimsPath?: string) {
  const decoded = decodeJwt(token);
  if (!decoded) {
    return undefined;
  }
  const pathList = claimsPath?.split('.') ?? [];
  const claimsArea = pathList.reduce((acc, curr) => {
    if (acc && acc[curr]) {
      return acc[curr];
    }
    return undefined;
  }, decoded);
  return claimsArea;
}

function decodeJwt(token: string) {
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  var jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );

  return JSON.parse(jsonPayload);
}

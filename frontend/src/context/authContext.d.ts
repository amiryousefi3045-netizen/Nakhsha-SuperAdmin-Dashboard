import * as React from 'react';

declare const AuthCtx: React.Context<{
  user: any;
  setUser: (u: any) => void;
}>;

export default AuthCtx;

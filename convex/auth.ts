import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // The password provider only persists `email` by default; make sure the
      // users row is created (sign-up flow) with the email set.
      profile: (params) => {
        return {
          email: params.email as string,
          emailVerified: false,
        };
      },
    }),
  ],
});

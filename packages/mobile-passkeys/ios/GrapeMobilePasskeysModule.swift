import ExpoModulesCore

/// iOS bridge for the optional deterministic-passkey wallet feature.
///
/// Apple's native PRF API has changed across recent SDK releases. Keep the
/// module available to JavaScript so the rest of the wallet can run on iOS,
/// but fail this optional flow explicitly until its credential implementation
/// is updated and verified against the production SDK.
public final class GrapeMobilePasskeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GrapeMobilePasskeys")

    AsyncFunction("isSupportedAsync") { () -> Bool in
      false
    }

    AsyncFunction("createDeterministicPasskeyWalletAsync") { (_: CreateDeterministicPasskeyWalletInput) in
      throw PasskeyUnavailableException("iOS passkey bridge unavailable")
    }

    AsyncFunction("getDeterministicPasskeyWalletPrfAsync") { (_: GetDeterministicPasskeyWalletPrfInput) in
      throw PasskeyUnavailableException("iOS passkey bridge unavailable")
    }
  }
}

private struct CreateDeterministicPasskeyWalletInput: Record {
  @Field var challenge: String = ""
  @Field var rpId: String = ""
  @Field var rpName: String = ""
  @Field var userId: String = ""
  @Field var userName: String = ""
  @Field var userDisplayName: String = ""
  @Field var prfInput: String = ""
}

private struct GetDeterministicPasskeyWalletPrfInput: Record {
  @Field var challenge: String = ""
  @Field var rpId: String = ""
  @Field var credentialId: String = ""
  @Field var credentialIdB64Url: String?
  @Field var prfInput: String = ""
}

private final class PasskeyUnavailableException: GenericException<String> {
  override var reason: String {
    "Deterministic passkey wallets are not available in this iOS build."
  }
}

import AuthenticationServices
import ExpoModulesCore
import UIKit

public final class GrapeMobilePasskeysModule: Module, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private enum PendingOperation {
    case create(Promise)
    case get(Promise)
  }

  private var pendingOperation: PendingOperation?
  private var activeController: ASAuthorizationController?

  public func definition() -> ModuleDefinition {
    Name("GrapeMobilePasskeys")

    AsyncFunction("isSupportedAsync") { () -> Bool in
      if #available(iOS 18.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("createDeterministicPasskeyWalletAsync") { (input: CreateDeterministicPasskeyWalletInput, promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.reject("ERR_PASSKEY_UNSUPPORTED", "Deterministic passkeys require iOS 18 or newer.")
        return
      }
      self.startCreateRequest(input: input, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("getDeterministicPasskeyWalletPrfAsync") { (input: GetDeterministicPasskeyWalletPrfInput, promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.reject("ERR_PASSKEY_UNSUPPORTED", "Deterministic passkeys require iOS 18 or newer.")
        return
      }
      self.startAssertionRequest(input: input, promise: promise)
    }.runOnQueue(.main)
  }

  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
       let window = scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first {
      return window
    }

    return ASPresentationAnchor()
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    defer {
      pendingOperation = nil
      activeController = nil
    }

    switch pendingOperation {
    case .create(let promise):
      guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration else {
        promise.reject("ERR_PASSKEY_CREATE", "Passkey registration did not return a platform credential.")
        return
      }
      guard let prfOutput = credential.prf, prfOutput.isSupported, let first = prfOutput.first else {
        promise.reject("ERR_PASSKEY_CREATE", "The selected passkey does not support PRF output.")
        return
      }
      promise.resolve([
        "credentialId": credential.credentialID.base64EncodedString(),
        "credentialIdB64Url": credential.credentialID.base64URLEncodedString(),
        "prfOutput": first.base64EncodedString()
      ])
    case .get(let promise):
      guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
        promise.reject("ERR_PASSKEY_ASSERT", "Passkey assertion did not return a platform credential.")
        return
      }
      guard let prfOutput = credential.prf?.first else {
        promise.reject("ERR_PASSKEY_ASSERT", "The selected passkey did not return PRF output.")
        return
      }
      promise.resolve([
        "prfOutput": prfOutput.base64EncodedString()
      ])
    case .none:
      return
    }
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    defer {
      pendingOperation = nil
      activeController = nil
    }

    switch pendingOperation {
    case .create(let promise):
      promise.reject("ERR_PASSKEY_CREATE", error.localizedDescription)
    case .get(let promise):
      promise.reject("ERR_PASSKEY_ASSERT", error.localizedDescription)
    case .none:
      break
    }
  }

  @available(iOS 18.0, *)
  private func startCreateRequest(input: CreateDeterministicPasskeyWalletInput, promise: Promise) {
    guard pendingOperation == nil else {
      promise.reject("ERR_PASSKEY_BUSY", "Another passkey request is already in progress.")
      return
    }

    do {
      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: input.rpId)
      let request = provider.createCredentialRegistrationRequest(
        challenge: try Data(base64EncodedStrict: input.challenge),
        name: input.userName,
        userID: try Data(base64EncodedStrict: input.userId)
      )
      let saltValues = ASAuthorizationPublicKeyCredentialPRFAssertionInputValues(
        saltInput1: try Data(base64EncodedStrict: input.prfInput),
        saltInput2: nil
      )
      request.prf = ASAuthorizationPublicKeyCredentialPRFRegistrationInput(inputValues: saltValues)
      request.requestStyle = .standard
      beginAuthorization([request], operation: .create(promise))
    } catch {
      promise.reject("ERR_PASSKEY_CREATE", error.localizedDescription)
    }
  }

  @available(iOS 18.0, *)
  private func startAssertionRequest(input: GetDeterministicPasskeyWalletPrfInput, promise: Promise) {
    guard pendingOperation == nil else {
      promise.reject("ERR_PASSKEY_BUSY", "Another passkey request is already in progress.")
      return
    }

    do {
      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: input.rpId)
      let request = provider.createCredentialAssertionRequest(
        challenge: try Data(base64EncodedStrict: input.challenge)
      )
      let credentialIdData = try Data(
        base64EncodedStrict: input.credentialIdB64Url?.base64URLToBase64() ?? input.credentialId
      )
      request.allowedCredentials = [
        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: credentialIdData)
      ]
      let saltValues = ASAuthorizationPublicKeyCredentialPRFAssertionInputValues(
        saltInput1: try Data(base64EncodedStrict: input.prfInput),
        saltInput2: nil
      )
      request.prf = ASAuthorizationPublicKeyCredentialPRFAssertionInput(
        inputValues: saltValues,
        perCredentialInputValues: nil
      )
      beginAuthorization([request], operation: .get(promise))
    } catch {
      promise.reject("ERR_PASSKEY_ASSERT", error.localizedDescription)
    }
  }

  private func beginAuthorization(_ requests: [ASAuthorizationRequest], operation: PendingOperation) {
    let controller = ASAuthorizationController(authorizationRequests: requests)
    pendingOperation = operation
    activeController = controller
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
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

private extension Data {
  init(base64EncodedStrict value: String) throws {
    guard let data = Data(base64Encoded: value) else {
      throw PasskeyDataError.invalidBase64
    }
    self = data
  }

  func base64URLEncodedString() -> String {
    return base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

private extension String {
  func base64URLToBase64() -> String {
    let normalized = self
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = normalized.count % 4
    if remainder == 0 {
      return normalized
    }
    return normalized + String(repeating: "=", count: 4 - remainder)
  }
}

private enum PasskeyDataError: Error {
  case invalidBase64

  var localizedDescription: String {
    switch self {
    case .invalidBase64:
      return "The passkey payload included malformed base64 data."
    }
  }
}

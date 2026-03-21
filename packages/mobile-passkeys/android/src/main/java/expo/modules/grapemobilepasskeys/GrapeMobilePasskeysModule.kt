package expo.modules.grapemobilepasskeys

import android.os.Build
import android.util.Base64
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.functions.Queues
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class GrapeMobilePasskeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GrapeMobilePasskeys")

    AsyncFunction("isSupportedAsync") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
    }

    AsyncFunction("createDeterministicPasskeyWalletAsync") { input: CreateDeterministicPasskeyWalletInput, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_PASSKEY_NO_ACTIVITY", "A foreground Activity is required for passkey creation.", null)
        return@AsyncFunction
      }

      CoroutineScope(Dispatchers.Main).launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val createResponse = credentialManager.createCredential(
            activity,
            CreatePublicKeyCredentialRequest(buildCreateRequestJson(input))
          ) as? CreatePublicKeyCredentialResponse
            ?: throw IllegalStateException("Credential creation did not return a public-key credential response.")

          val registrationJson = JSONObject(createResponse.registrationResponseJson)
          val credentialIdB64Url = registrationJson.optString("rawId").ifEmpty {
            registrationJson.getString("id")
          }

          val getResponse = credentialManager.getCredential(
            activity,
            GetCredentialRequest(
              listOf(
                GetPublicKeyCredentialOption(
                  buildAssertionRequestJson(
                    challenge = input.challenge,
                    rpId = input.rpId,
                    credentialIdB64Url = credentialIdB64Url,
                    prfInput = input.prfInput
                  )
                )
              )
            )
          )

          val publicKeyCredential = getResponse.credential as? PublicKeyCredential
            ?: throw IllegalStateException("Credential assertion did not return a public-key credential.")
          val authJson = JSONObject(publicKeyCredential.authenticationResponseJson)
          val prfOutputB64Url = authJson
            .getJSONObject("clientExtensionResults")
            .getJSONObject("prf")
            .getJSONObject("results")
            .getString("first")

          promise.resolve(
            mapOf(
              "credentialId" to base64UrlToBase64(credentialIdB64Url),
              "credentialIdB64Url" to credentialIdB64Url,
              "prfOutput" to base64UrlToBase64(prfOutputB64Url)
            )
          )
        } catch (error: Throwable) {
          promise.reject("ERR_PASSKEY_CREATE", error.message ?: "Unable to create passkey wallet.", error)
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getDeterministicPasskeyWalletPrfAsync") { input: GetDeterministicPasskeyWalletPrfInput, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_PASSKEY_NO_ACTIVITY", "A foreground Activity is required for passkey verification.", null)
        return@AsyncFunction
      }

      CoroutineScope(Dispatchers.Main).launch {
        try {
          val credentialManager = CredentialManager.create(activity)
          val getResponse = credentialManager.getCredential(
            activity,
            GetCredentialRequest(
              listOf(
                GetPublicKeyCredentialOption(
                  buildAssertionRequestJson(
                    challenge = input.challenge,
                    rpId = input.rpId,
                    credentialIdB64Url = input.credentialIdB64Url ?: base64ToBase64Url(input.credentialId),
                    prfInput = input.prfInput
                  )
                )
              )
            )
          )

          val publicKeyCredential = getResponse.credential as? PublicKeyCredential
            ?: throw IllegalStateException("Credential assertion did not return a public-key credential.")
          val authJson = JSONObject(publicKeyCredential.authenticationResponseJson)
          val prfOutputB64Url = authJson
            .getJSONObject("clientExtensionResults")
            .getJSONObject("prf")
            .getJSONObject("results")
            .getString("first")

          promise.resolve(
            mapOf(
              "prfOutput" to base64UrlToBase64(prfOutputB64Url)
            )
          )
        } catch (error: Throwable) {
          promise.reject("ERR_PASSKEY_ASSERT", error.message ?: "Unable to evaluate passkey PRF.", error)
        }
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun buildCreateRequestJson(input: CreateDeterministicPasskeyWalletInput): String {
    return JSONObject()
      .put("challenge", base64ToBase64Url(input.challenge))
      .put(
        "rp",
        JSONObject()
          .put("id", input.rpId)
          .put("name", input.rpName)
      )
      .put(
        "user",
        JSONObject()
          .put("id", base64ToBase64Url(input.userId))
          .put("name", input.userName)
          .put("displayName", input.userDisplayName)
      )
      .put(
        "pubKeyCredParams",
        JSONArray()
          .put(JSONObject().put("type", "public-key").put("alg", -7))
          .put(JSONObject().put("type", "public-key").put("alg", -257))
      )
      .put("timeout", 60_000)
      .put(
        "authenticatorSelection",
        JSONObject()
          .put("authenticatorAttachment", "platform")
          .put("residentKey", "required")
          .put("userVerification", "required")
      )
      .put("attestation", "none")
      .toString()
  }

  private fun buildAssertionRequestJson(
    challenge: String,
    rpId: String,
    credentialIdB64Url: String,
    prfInput: String
  ): String {
    return JSONObject()
      .put("challenge", base64ToBase64Url(challenge))
      .put("rpId", rpId)
      .put("timeout", 60_000)
      .put("userVerification", "required")
      .put(
        "allowCredentials",
        JSONArray().put(
          JSONObject()
            .put("id", credentialIdB64Url)
            .put("type", "public-key")
        )
      )
      .put(
        "extensions",
        JSONObject().put(
          "prf",
          JSONObject().put(
            "eval",
            JSONObject().put("first", base64ToBase64Url(prfInput))
          )
        )
      )
      .toString()
  }

  private fun base64ToBase64Url(value: String): String {
    return value
      .replace('+', '-')
      .replace('/', '_')
      .replace("=", "")
  }

  private fun base64UrlToBase64(value: String): String {
    val normalized = value
      .replace('-', '+')
      .replace('_', '/')
    val padding = when (normalized.length % 4) {
      0 -> ""
      else -> "=".repeat(4 - (normalized.length % 4))
    }
    val bytes = Base64.decode(normalized + padding, Base64.DEFAULT)
    return Base64.encodeToString(bytes, Base64.NO_WRAP)
  }
}

class CreateDeterministicPasskeyWalletInput : Record {
  @Field
  var challenge: String = ""

  @Field
  var rpId: String = ""

  @Field
  var rpName: String = ""

  @Field
  var userId: String = ""

  @Field
  var userName: String = ""

  @Field
  var userDisplayName: String = ""

  @Field
  var prfInput: String = ""
}

class GetDeterministicPasskeyWalletPrfInput : Record {
  @Field
  var challenge: String = ""

  @Field
  var rpId: String = ""

  @Field
  var credentialId: String = ""

  @Field
  var credentialIdB64Url: String? = null

  @Field
  var prfInput: String = ""
}

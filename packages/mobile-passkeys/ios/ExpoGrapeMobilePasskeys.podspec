require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoGrapeMobilePasskeys'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Grape'
  s.homepage       = 'https://wallet.grape.app'
  # The module can be linked by older iOS targets. Its PRF passkey APIs are
  # guarded with @available(iOS 18.0, *) and report unsupported at runtime.
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { :git => 'https://example.invalid/grape-mobile-passkeys' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end

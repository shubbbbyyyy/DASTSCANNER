// ZAP Authentication Script (type: Authentication, engine: ECMAScript / Oracle Nashorn).
//
// Handi's User/Provider login is two HTTP requests, which ZAP's built-in "json"
// authentication method can't do (it only sends one). This script performs both:
//
//   1. POST {baseUrl}/auth/signin        { role, phoneNumber }         -> sessionId
//   2. POST {baseUrl}/auth/verify-phone-number
//                                         { sessionId, phoneNumber, code } -> data.idToken
//
// Context config picks the role (context-level "Role" param, shared by every user in
// that context) and per-user "Phone Number" credential; "OTP Code" is the dev
// environment's fixed test code (verify with the team before relying on it in CI).
//
// >>> UNTESTED AGAINST THE REAL API — write-only from ZAP's documented scripting API
// >>> and public examples, not run against Handi's dev environment yet. Load it into
// >>> ZAP Desktop (Scripts tab -> Authentication -> Load) and test one login manually
// >>> (right-click context -> Users -> test) before trusting it in CI.
//
// See ../automation.yml (contexts: User, Provider) for how this is wired up, and
// https://www.zaproxy.org/docs/desktop/addons/authentication-helper/session-header/
// for how the resulting data.idToken gets turned into an Authorization header.

var HttpRequestHeader = Java.type("org.parosproxy.paros.network.HttpRequestHeader");
var HttpHeader = Java.type("org.parosproxy.paros.network.HttpHeader");
var URI = Java.type("org.apache.commons.httpclient.URI");

function getRequiredParamsNames() {
	return ["Base URL", "Role", "OTP Code"];
}

function getOptionalParamsNames() {
	return [];
}

function getCredentialsParamsNames() {
	return ["Phone Number"];
}

function jsonPost(helper, url, bodyObj) {
	var msg = helper.prepareMessage();
	var requestUri = new URI(url, false);
	var requestHeader = new HttpRequestHeader(HttpRequestHeader.POST, requestUri, HttpHeader.HTTP11);
	requestHeader.setHeader(HttpHeader.CONTENT_TYPE, "application/json");
	msg.setRequestHeader(requestHeader);
	msg.setRequestBody(JSON.stringify(bodyObj));
	msg.getRequestHeader().setContentLength(msg.getRequestBody().length());
	helper.sendAndReceive(msg);
	return msg;
}

function authenticate(helper, paramsValues, credentials) {
	var baseUrl = paramsValues.get("Base URL");
	var role = paramsValues.get("Role");
	var otpCode = paramsValues.get("OTP Code");
	var phoneNumber = credentials.getParam("Phone Number");

	print("otp-signin-auth: signing in role=" + role + " phoneNumber=" + phoneNumber);

	var signInMsg = jsonPost(helper, baseUrl + "/auth/signin", {
		role: role,
		phoneNumber: phoneNumber
	});

	var signInBody = JSON.parse(signInMsg.getResponseBody().toString());
	var sessionId = signInBody && signInBody.data && signInBody.data.sessionId;
	if (!sessionId) {
		print("otp-signin-auth: /auth/signin did not return data.sessionId — response was: " +
			signInMsg.getResponseBody().toString());
		return signInMsg;
	}

	var verifyMsg = jsonPost(helper, baseUrl + "/auth/verify-phone-number", {
		sessionId: sessionId,
		phoneNumber: phoneNumber,
		code: otpCode
	});

	print("otp-signin-auth: verify-phone-number status=" + verifyMsg.getResponseHeader().getStatusCode());
	return verifyMsg;
}

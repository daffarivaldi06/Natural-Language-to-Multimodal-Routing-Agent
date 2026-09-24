async function test() {
  const loginRes = await fetch("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@routing.local", password: "User1234!" })
  });
  const loginData = await loginRes.json();
  console.log("Login Status:", loginRes.status, loginData.role);

  if (loginData.token) {
    console.log("Sending routing query...");
    const routeRes = await fetch("http://localhost:3000/api/v1/route", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${loginData.token}`
      },
      body: JSON.stringify({ query: "How do I get from Lille Flandres to Grand Place?" })
    });
    console.log("Route Status:", routeRes.status);
    const routeData = await routeRes.json();
    console.log("Route Response:", JSON.stringify(routeData, null, 2).substring(0, 500));
  }
}
test().catch(console.error);

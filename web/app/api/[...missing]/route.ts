// Any /api address that does not exist answers with JSON (not the HTML 404 page).
function missing(req: Request) {
  return Response.json({ error: { message: `No such endpoint: ${req.method} ${new URL(req.url).pathname}` } }, { status: 404 });
}

export { missing as GET, missing as POST, missing as PUT, missing as PATCH, missing as DELETE };

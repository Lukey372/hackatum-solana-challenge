from fastapi import FastAPI


app = FastAPI()


@app.get("/")
def index():
    return "health test"


@app.post("/pay/kebab")
def buy_kebab():
    return "kebab"


@app.post("/pay/pizza")
def buy_pizza():
    return "pizza"

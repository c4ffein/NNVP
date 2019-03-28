FROM python:alpine
MAINTAINER "c4ffein@gmail.com"

RUN mkdir /app
COPY requirements.txt /app
WORKDIR /app
RUN pip install -r requirements.txt
COPY . ./
ENTRYPOINT ["python"]
CMD ["server.py"]

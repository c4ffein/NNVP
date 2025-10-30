#! /usr/bin/env python3
# -- coding:utf-8 --

# This file will expose a REST api.
# It should be run with the command : "python -m flask run" after defining
# the location of the file with "export FLASK_APP = path" or "set" on Windows.

from flask import Flask, request, send_from_directory, redirect, url_for, jsonify
from request_to_dict import *
from generate_python_from_graph import *
from flask import Response
# from flask_limiter import Limiter
# from flask_limiter.util import get_remote_address
# from multiprocessing import Process, current_process
from flask_cors import CORS

app = Flask(__name__)

'''
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["5 per minute", "1 per second"],
)'''


# Ban list works with the limiter but the WSGI developpement server does not allow a correct multithreaded control of the generate function,
# so it will return in the next version with propably an nginx server.
# ban_list = ["127.0.0.1"]

# Main page route redirecting to the index page TODO : delete
@app.route('/')
def redirect_index():
    return redirect('/grapheditor/www/index.html')

cors = CORS(app, resources={r"/generate": {"origins": "*"}})

# The generate route allows the user to create the python file from the graph.
# It calls an extern function which create a dict object from the post data, which will be easier to manipulate after.
# Then it returns a python file.
@app.route('/generate', methods=['POST'])
#@limiter.limit("1 per day", exempt_when=lambda:get_remote_address() not in ban_list)
def generate_python():
    import sys
    graph = request_to_dict(request.json)
    return jsonify({'file': generate_python_from_graph(graph)})

if __name__ == '__main__':
    app.run(threaded=True, host='0.0.0.0')
    # Debug mode has to be desactivated for the release.

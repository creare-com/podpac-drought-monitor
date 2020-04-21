#!/usr/bin/env python
# coding: utf-8

# # Modify the chunks for an existing file

# In[2]:


get_ipython().run_line_magic('pylab', 'inline')


# In[3]:


import podpac
from podpac import Node
from podpac import alglib
import traitlets as tl
import logging
import time
import inspect
logger = logging.getLogger('podpac')
logger.setLevel(logging.INFO)


# In[7]:


SRC_FILE = r's3://podpac-drought-monitor-s3/SMAP.zarr'
DST_FILE = r's3://podpac-drought-monitor-s3/SMAP_CHUNKED.zarr'
CHUNKS = {'lat': 256, 'lon': 256, 'time': 16}


# In[5]:


settings = {
    "FUNCTION_NAME": "podpac-drought-monitor-lambda-compute-stats",
    "S3_BUCKET_NAME": "podpac-drought-monitor-s3",
    "FUNCTION_ROLE_NAME": "podpac-drought-monitor-role",
    "MULTITHREADING": True,
    "N_THREADS": 64,
    "AWS_ACCESS_KEY_ID": podpac.settings["AWS_ACCESS_KEY_ID"],
    "AWS_SECRET_ACCESS_KEY": podpac.settings["AWS_SECRET_ACCESS_KEY"],
    "AWS_REGION_NAME": podpac.settings["AWS_REGION_NAME"],
    "AWS_BUDGET_AMOUNT": 100,
    "AWS_BUDGET_EMAIL": podpac.settings["AWS_BUDGET_EMAIL"],
    "FUNCTION_DEPENDENCIES_KEY": "podpac_deps.zip",
}
podpac.settings.update(settings)
# settings


# In[6]:


N_WORKERS = 25


# In[8]:


node = podpac.data.Zarr(
    source=SRC_FILE,
    time_key='time',
    lat_key='lat',
    lon_key='lon',
    skip_validation=True,
)
# node


# In[10]:


coords_mp = node.coordinates#.select({"lat": [], "lon": []})
coords_mp


# In[11]:


node_p = podpac.managers.Lambda(
    source=node,
    eval_settings=settings,
    eval_timeout=1.25
)


# In[12]:


node_p.get_budget()
node_p.describe()


# In[13]:


node_mp = podpac.core.managers.parallel.ParallelAsyncOutputZarr(
    source=node_p, 
    number_of_workers=N_WORKERS,
    chunks=CHUNKS,
    zarr_file=DST_FILE, init_file_mode='a',
    skip_existing=False,  # Set this to True on subsequent runs
    list_dir=False,  # Set this to True on subsequent runs
    aws_config_kwargs=dict(max_pool_connections=N_WORKERS*10),  # This is needed to avoid a warning about the number of open connections
    start_i = 0  # I was developing the software as I was doing this computation, so I made improvements along the way and did not want to start over
)
node_mp


# In[ ]:


# time.sleep(3600 * 2)
o_mp = node_mp.eval(coords_mp)


# In[ ]:


# Check the results
out_f = podpac.data.Zarr(
    source=DST_FILE,
)
out_f


# In[ ]:


d0 = cats.dataset['d0'][:, :, -128]



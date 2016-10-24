var DEBUG = (window.location.hostname == 'local.minrk.net');
if (DEBUG) {
  var client_id = '339cf6a31b24852a37a1';
  var auth_host = 'all-my-pulls-auth-debug.herokuapp.com';
} else {
  var client_id = '19277e98ad9400d0133b';
  var auth_host = 'all-my-pulls-auth.herokuapp.com';
}

function getNextPage(linksHeader) {
  // from github.js Requestable.js
  var links = linksHeader.split(/\s*,\s*/); // splits and strips the urls
  
  return links.reduce(function(nextUrl, link) {
    if (link.search(/rel\s*=\s*"next"/) !== -1) {
      return (link.match(/<(.*)>/) || [])[1];
    }
    return nextUrl;
  }, undefined);
}


var PullRequest = React.createClass({
  displayName: 'PullRequest',
  render: function() {
    var updated = moment(this.props.data.updated_at).fromNow();
    var created = moment(this.props.data.created_at).fromNow();
    var milestone = (this.props.data.milestone && this.props.data.milestone.title);
    return (
      <div className="row">
        <div className="pull-request col-xs-12">
          <a href={this.props.data.html_url} className="pr-link">
          <div className='pr-title-row'>
            <span className='pr-repo-name'>
              {this.props.data.base.repo.full_name}
            </span>
            <span className='pr-title'>
              {this.props.data.title}
            </span>
        <span className={(this.props.data.status === 'failure') ? 'label label-danger'
                         : (this.props.data.status === 'failure') ? 'label label-warning'
                         : 'hidden'}>
              {this.props.data.status}
            </span>
          </div>
          <div className='pr-subtitle'>
            #{this.props.data.number}
            { " " }
            opened {created}
            { " " }
            by @{this.props.data.user.login}
            { " " }
            {milestone}
            <br/>
            Updated {updated}
          </div>
          </a>
        </div>
      </div>
    )
  },
});


var PullRequestList = React.createClass({
  displayName: 'PullRequestList',
  getInitialState: function() {
    return {
      pulls: [],
      loadedRepos: {},
    };
  },
  componentDidMount: function() {
    this.fetchNewPulls(this.props.repos);
  },
  componentWillReceiveProps: function (props) {
    // on updated props, update PRs
    this.fetchNewPulls(props.repos);
  },
  render: function() {
    var that = this;
    
    var reposWithPulls = {};
    // apply exclusions
    var pulls = this.state.pulls.filter(function (pr_data) {
      var repo = pr_data.base.repo;
      for (var exclusion, i = 0; i < that.props.exclusions.length; i++) {
        exclusion = that.props.exclusions[i];
        if (exclusion.indexOf('/') !== -1) {
          // repo exclusion
          if (repo.full_name === exclusion) return false;
        } else {
          // org exclusion
          if (repo.owner.login === exclusion) return false;
        }
      }
      reposWithPulls[repo.full_name] = true;
      return true;
    });
    
    var prNodes = pulls.map(function (pr_data) {
      return (
        <PullRequest key={pr_data.id} data={pr_data} github={github} />
      )
    });
    // sort by updated:
    prNodes.sort(function (prA, prB) {
      var a = prA.props.data.updated_at;
      var b = prB.props.data.updated_at;
      if (a > b) return -1;
      if (b > a) return 1;
      return 0;
    });
    return (
      <div className="prList">
        <div className="">
        {pulls.length} pull requests in {Object.keys(reposWithPulls).length} repos
        </div>
        {prNodes}
      </div>
    )
  },
  fetchNewPulls: function (repos) {
    // fetch PRs for repos we haven't seen before
    var that = this;
    repos.map(function (repo) {
      if (!that.state.loadedRepos[repo.full_name]) {
        that.loadPulls(repo);
      }
    })
  },
  loadPulls: function(repo) {
    // load pull-requests for a single repo
    var that = this;
    var closure = {}
    this.state.loadedRepos[repo.full_name] = true;
    this.props.github.getRepo(repo.full_name).listPullRequests().then(function(resp) {
      closure.pulls = resp.data
      var getStatuses = []
      for (var i = 0; i < closure.pulls.length; i++) {
        getStatuses.push(that.props.github.getRepo(repo.full_name).listStatuses(closure.pulls[i].head.sha))
      }
      return Promise.all(getStatuses)
    }).then(function (result) {
      result.map(function (resp, i) {
        var statuses = resp.data
        if (!statuses) return
        closure.pulls[i].status = (
          (statuses[0].state === 'success') ? 'success'
            : (statuses.some(elem => elem.state === 'failure')) ? 'failure'
            : (statuses.some(elem => elem.state === 'pending')) ? 'pending'
            : undefined
        )
      })
    }).then(function() {
      that.setState({
        pulls: that.state.pulls.concat(closure.pulls)
      })
    })
  },
});


var User = React.createClass({
  displayName: 'User',
  getInitialState: function() {
    var exclusions = ['my-org', 'my-org/repo', 'conda-forge/staged-recipes'];
    if (localStorage.all_my_pulls_exclusions) {
      try {
        exclusions = JSON.parse(localStorage.all_my_pulls_exclusions);
      } catch (e) {
        console.error("Failed to load exclusions from localStorage");
      }
    }
    return {
      repos: [],
      profile: {},
      exclusions: exclusions,
    };
  },
  componentDidMount: function() {
    window.props = this.props;
    this.loadProfile();
    this.loadRepos();
  },
  render: function() {
    return (
      <div className="user">
        <h2 className="text-center">
          Showing all GitHub pull requests mergeable by
          <span className="username">
          {" "} @{this.state.profile.login}
          </span>
        </h2>
        orgs/repos to exclude:
        <ReactTagsInput value={this.state.exclusions} onChange={this.handleExclusionsChange} />
        <PullRequestList repos={this.state.repos} exclusions={this.state.exclusions} github={github} />
      </div>
    )
  },
  handleExclusionsChange: function(value) {
    this.setState({exclusions: value});
    localStorage.all_my_pulls_exclusions = JSON.stringify(value);
  },
  loadProfile: function () {
    var that = this;
    this.props.user.getProfile().then(function (profile) {
      that.setState({
        profile: profile.data
      });
    });
  },
  loadRepos: function() {
    var that = this;
    // use paged request to load data piecemeal
    // this is based on github.js _requestAllPages
    var user = this.props.user;
    function handleMoreRepos(resp) {
      if (resp.headers.link !== undefined) {
        var nextUrl = getNextPage(resp.headers.link);
        if (nextUrl) {
          user._request('GET', nextUrl).then(handleMoreRepos);
        }
      }
      // filter out repos we can't push to and don't have open issues
      var new_repos = resp.data.filter(function (repo) {
        // exclude repos I can't push to
        // it doesn't seem like these should show up in this list, but some org repos do
        if (!repo.permissions.push) return false;
        // exclude repos with no issues
        if (repo.open_issues_count === 0) return false;
        // exclude repos not updated in 2 years,
        // to limit wasted API calls
        var updated = new Date(repo.updated_at);
        var today = new Date();
        var years_ago = (today - updated) / 31556926000;
        if (years_ago > 2) return false;
        return true;
      })
      that.setState({
        repos: that.state.repos.concat(new_repos),
      });
    }
    user._request('GET', '/user/repos', {sort: 'updated'}).then(handleMoreRepos);
  },
});


var RateLimit = React.createClass({
  displayName: 'RateLimit',
  render: function() {
    var reset_date = new Date(this.props.data.rate.reset * 1000);
    return (
      <h2 className="rate-limit-error text-center">
      GitHub API Rate limit exceeded! Try again {moment(reset_date).fromNow()}.
      </h2>
    )
  },
});


var code_match = window.location.href.match(/\?code=(.*)/);
if (!code_match) {
  window.location = 'https://github.com/login/oauth/authorize?scope=read:org&client_id=' + client_id + '&redirect_uri=' + window.location;
} else {
  var code = code_match[1];
  // scrub OAuth code from URL
  window.history.replaceState("not sure", "All My Pulls", window.location.pathname);
  
  // request OAuth token
  $.getJSON('https://' + auth_host + '/authenticate/' + code, function(data) {
    // create GitHub client
    var github = window.github = new GitHub({
      token: data.token
    });
    
    // check rateLimit, then proceed
    github.getRateLimit().getRateLimit().then(function(resp) {
      console.log('API limit remaining: ' + resp.data.rate.remaining);
      // date constructor takes epoch milliseconds and we get epoch seconds
      if (resp.data.rate.remaining === 0) {
        // don't burn the rate limit
        ReactDOM.render(
          <RateLimit data={resp.data} />,
          document.getElementById('content')
        );
        return;
      }

      var user = github.getUser();
      ReactDOM.render(
        <User github={github} user={user} data={data}/>,
        document.getElementById('content')
      );
    }).catch(function(error) {
        console.log('Error fetching rate limit', error.message);
    });
  });
}
